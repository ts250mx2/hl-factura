import fs from "fs";
import type { Emisor } from "../types";
import { listarFacturas, listarPagosRep, listarBoveda, getFactura } from "../repos";
import { round2 } from "../sat/importes";
import { parseMontosCfdi } from "./polizas";
import { getConfigFiscal } from "./repos";

// Panel fiscal del mes: ingresos cobrados (flujo), IVA cobrado vs acreditable,
// ISR RESICO PF (Art. 113-E) o pago provisional PM por coeficiente de utilidad.

/** Tabla mensual de ISR RESICO personas físicas (Art. 113-E LISR). */
const TABLA_RESICO: { hasta: number; tasa: number }[] = [
  { hasta: 25_000.0, tasa: 0.01 },
  { hasta: 50_000.0, tasa: 0.011 },
  { hasta: 83_333.33, tasa: 0.015 },
  { hasta: 208_333.33, tasa: 0.02 },
  { hasta: 3_500_000.0, tasa: 0.025 },
];

export interface PanelFiscal {
  periodo: { anio: string; mes: string };
  flujo: {
    ingresosCobrados: number; // base sin IVA, efectivamente cobrada
    ivaCobrado: number;
    retencionesAcreditables: number;
    ivaAcreditablePagado: number;
    gastosSinXml: number; // gastos donde no se pudo desglosar IVA
  };
  iva: { aCargo: number; aFavor: number };
  resico: null | {
    tasa: number;
    isrCausado: number;
    retenciones: number;
    isrAPagar: number;
    excedeLimite: boolean;
  };
  pm: null | {
    ingresosNominales: number;
    coeficiente: number;
    utilidadEstimada: number;
    pagoProvisional: number;
  };
}

export async function calcularPanelFiscal(empresa: Emisor, anio: string, mes: string): Promise<PanelFiscal> {
  const cfg = await getConfigFiscal(empresa.id);
  const enPeriodo = (fecha: string) => fecha.startsWith(`${anio}-${mes}`);

  const facturas = (await listarFacturas([empresa.id])).filter((f) => f.estado === "timbrada");

  /* --- Ingresos efectivamente cobrados (flujo de efectivo) --- */
  let ingresosCobrados = 0;
  let ivaCobrado = 0;
  let retenciones = 0;

  // PUE del mes: se consideran cobradas al emitirse
  for (const f of facturas.filter((f) => f.metodoPago === "PUE" && f.tipoDeComprobante === "I" && enPeriodo(f.fecha))) {
    ingresosCobrados = round2(ingresosCobrados + (f.subTotal - f.descuento));
    ivaCobrado = round2(ivaCobrado + f.totalTraslados);
    retenciones = round2(retenciones + f.totalRetenciones);
  }
  // Cobros REP del mes: proporcional al pagado de cada factura
  const pagos = (await listarPagosRep([empresa.id])).filter(
    (p) => p.estado === "timbrada" && enPeriodo(p.fechaPago),
  );
  for (const p of pagos) {
    for (const d of p.doctos) {
      const f = facturas.find((x) => x.id === d.facturaId) ?? (await getFactura(d.facturaId));
      if (!f || f.total <= 0) continue;
      const factor = d.pagado / f.total;
      ingresosCobrados = round2(ingresosCobrados + (f.subTotal - f.descuento) * factor);
      retenciones = round2(retenciones + f.totalRetenciones * factor);
      ivaCobrado = round2(
        ivaCobrado +
          d.impuestos.filter((i) => !i.esRetencion && i.impuesto === "002").reduce((s, i) => s + (i.importe ?? 0), 0),
      );
    }
  }

  /* --- IVA acreditable efectivamente pagado (gastos PUE vigentes y deducibles) --- */
  let ivaAcreditable = 0;
  let gastosSinXml = 0;
  const recibidas = (await listarBoveda([empresa.id], { tipo: "recibida", limite: 1000 })).filter(
    (c) =>
      enPeriodo(c.fecha) &&
      c.estatusSat === "vigente" &&
      c.deducible === "ok" &&
      (c.tipoComprobante ?? "I") === "I" &&
      c.metodoPago !== "PPD",
  );
  for (const c of recibidas) {
    if (c.xmlPath && fs.existsSync(c.xmlPath)) {
      try {
        ivaAcreditable = round2(ivaAcreditable + parseMontosCfdi(fs.readFileSync(c.xmlPath, "utf8")).traslados);
        continue;
      } catch {
        /* cae al conteo sin XML */
      }
    }
    gastosSinXml++;
  }

  const diferenciaIva = round2(ivaCobrado - ivaAcreditable);

  /* --- ISR según régimen configurado --- */
  let resico: PanelFiscal["resico"] = null;
  let pm: PanelFiscal["pm"] = null;

  if (cfg.regimenCalculo === "resico_pf") {
    const renglon = TABLA_RESICO.find((r) => ingresosCobrados <= r.hasta) ?? TABLA_RESICO[TABLA_RESICO.length - 1];
    const isrCausado = round2(ingresosCobrados * renglon.tasa);
    resico = {
      tasa: renglon.tasa,
      isrCausado,
      retenciones,
      isrAPagar: Math.max(0, round2(isrCausado - retenciones)),
      excedeLimite: ingresosCobrados > 3_500_000,
    };
  } else if (cfg.regimenCalculo === "pm_general") {
    // Ingresos nominales del mes (devengados): facturas I menos notas de crédito E
    let nominales = 0;
    for (const f of facturas.filter((f) => enPeriodo(f.fecha))) {
      const base = round2(f.subTotal - f.descuento);
      nominales = round2(nominales + (f.tipoDeComprobante === "E" ? -base : base));
    }
    const utilidad = round2(nominales * cfg.coeficienteUtilidad);
    pm = {
      ingresosNominales: nominales,
      coeficiente: cfg.coeficienteUtilidad,
      utilidadEstimada: utilidad,
      pagoProvisional: Math.max(0, round2(utilidad * 0.3)),
    };
  }

  return {
    periodo: { anio, mes },
    flujo: {
      ingresosCobrados,
      ivaCobrado,
      retencionesAcreditables: retenciones,
      ivaAcreditablePagado: ivaAcreditable,
      gastosSinXml,
    },
    iva: {
      aCargo: Math.max(0, diferenciaIva),
      aFavor: Math.max(0, -diferenciaIva),
    },
    resico,
    pm,
  };
}
