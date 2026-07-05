import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import type { Emisor, MetodoIsr, PanelFiscal, TipoImpuesto } from "../types";
import { listarFacturas, listarPagosRep, listarBoveda, getFactura } from "../repos";
import { listarRecibos } from "../nomina/repos";
import { round2 } from "../sat/importes";
import { getConfigFiscal } from "./repos";
import { impuestosDesdePerfil, metodoIsrDesdePerfil, IMPUESTO_LABEL } from "./obligaciones";

// Panel fiscal del mes armado a partir del régimen y las obligaciones registradas
// (Constancia de Situación Fiscal): calcula IVA de flujo, el ISR que corresponde
// al régimen y las retenciones a enterar. Todo con base en flujo de efectivo.

/** Tabla mensual de ISR RESICO personas físicas (Art. 113-E LISR). */
const TABLA_RESICO: { hasta: number; tasa: number }[] = [
  { hasta: 25_000.0, tasa: 0.01 },
  { hasta: 50_000.0, tasa: 0.011 },
  { hasta: 83_333.33, tasa: 0.015 },
  { hasta: 208_333.33, tasa: 0.02 },
  { hasta: 3_500_000.0, tasa: 0.025 },
];

/** Tarifa mensual del ISR (Art. 96 LISR, vigente 2024-2025). */
const TARIFA_ISR_MENSUAL: { li: number; cuota: number; pct: number }[] = [
  { li: 0.01, cuota: 0, pct: 0.0192 },
  { li: 746.05, cuota: 14.32, pct: 0.064 },
  { li: 6332.06, cuota: 371.83, pct: 0.1088 },
  { li: 11128.02, cuota: 893.63, pct: 0.16 },
  { li: 12935.83, cuota: 1182.88, pct: 0.1792 },
  { li: 15487.72, cuota: 1640.18, pct: 0.2136 },
  { li: 31236.5, cuota: 5004.12, pct: 0.2352 },
  { li: 49233.01, cuota: 9236.89, pct: 0.3 },
  { li: 93993.91, cuota: 22665.17, pct: 0.32 },
  { li: 125325.21, cuota: 32691.18, pct: 0.34 },
  { li: 375975.62, cuota: 117912.32, pct: 0.35 },
];

function isrTarifaMensual(base: number): number {
  if (base <= 0) return 0;
  let renglon = TARIFA_ISR_MENSUAL[0];
  for (const r of TARIFA_ISR_MENSUAL) if (base >= r.li) renglon = r;
  return round2(renglon.cuota + (base - renglon.li) * renglon.pct);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

interface AnalisisGasto {
  base: number;
  traslados: number;
  retIsr: number;
  retIva: number;
}

/** Extrae de un XML recibido: base deducible, IVA trasladado y retenciones (ISR/IVA). */
function analizarGastoXml(xml: string): AnalisisGasto {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const comp = (Array.isArray(doc.Comprobante) ? doc.Comprobante[0] : doc.Comprobante) as
    | Record<string, unknown>
    | undefined;
  if (!comp) throw new Error("XML sin Comprobante");
  const num = (n: Record<string, unknown> | undefined, k: string) => Number(n?.[`@${k}`] ?? 0);
  const imp = (Array.isArray(comp.Impuestos) ? comp.Impuestos[0] : comp.Impuestos) as
    | Record<string, unknown>
    | undefined;

  let retIsr = 0;
  let retIva = 0;
  const retNodo = imp ? (Array.isArray(imp.Retenciones) ? imp.Retenciones[0] : imp.Retenciones) : undefined;
  if (retNodo) {
    const lista = (retNodo as Record<string, unknown>).Retencion;
    const arr = Array.isArray(lista) ? lista : lista ? [lista] : [];
    for (const r of arr as Record<string, unknown>[]) {
      const impuesto = String(r["@Impuesto"] ?? "");
      const importe = Number(r["@Importe"] ?? 0);
      if (impuesto === "001") retIsr = round2(retIsr + importe);
      else if (impuesto === "002") retIva = round2(retIva + importe);
    }
  }
  return {
    base: round2(num(comp, "SubTotal") - num(comp, "Descuento")),
    traslados: num(imp, "TotalImpuestosTrasladados"),
    retIsr,
    retIva,
  };
}

export async function calcularPanelFiscal(empresa: Emisor, anio: string, mes: string): Promise<PanelFiscal> {
  const cfg = await getConfigFiscal(empresa.id);
  const enPeriodo = (fecha: string) => fecha.startsWith(`${anio}-${mes}`);
  const facturas = (await listarFacturas([empresa.id])).filter((f) => f.estado === "timbrada");

  /* --- Ingresos efectivamente cobrados (flujo) e IVA cobrado --- */
  let ingresosCobrados = 0;
  let ivaCobrado = 0;
  let retencionesAcreditables = 0;

  for (const f of facturas.filter((f) => f.metodoPago === "PUE" && f.tipoDeComprobante === "I" && enPeriodo(f.fecha))) {
    ingresosCobrados = round2(ingresosCobrados + (f.subTotal - f.descuento));
    ivaCobrado = round2(ivaCobrado + f.totalTraslados);
    retencionesAcreditables = round2(retencionesAcreditables + f.totalRetenciones);
  }
  const pagos = (await listarPagosRep([empresa.id])).filter((p) => p.estado === "timbrada" && enPeriodo(p.fechaPago));
  for (const p of pagos) {
    for (const d of p.doctos) {
      const f = facturas.find((x) => x.id === d.facturaId) ?? (await getFactura(d.facturaId));
      if (!f || f.total <= 0) continue;
      const factor = d.pagado / f.total;
      ingresosCobrados = round2(ingresosCobrados + (f.subTotal - f.descuento) * factor);
      retencionesAcreditables = round2(retencionesAcreditables + f.totalRetenciones * factor);
      ivaCobrado = round2(
        ivaCobrado +
          d.impuestos.filter((i) => !i.esRetencion && i.impuesto === "002").reduce((s, i) => s + (i.importe ?? 0), 0),
      );
    }
  }

  /* --- Gastos deducibles pagados: IVA acreditable, base y retenciones a terceros --- */
  let ivaAcreditablePagado = 0;
  let gastosDeduciblesPagados = 0;
  let gastosSinXml = 0;
  let retTercerosIsr = 0;
  let retTercerosIva = 0;
  const recibidas = (await listarBoveda([empresa.id], { tipo: "recibida", limite: 1000 })).filter(
    (c) => enPeriodo(c.fecha) && c.estatusSat === "vigente" && (c.tipoComprobante ?? "I") === "I" && c.metodoPago !== "PPD",
  );
  for (const c of recibidas) {
    let analizado: AnalisisGasto | null = null;
    if (c.xmlPath && fs.existsSync(c.xmlPath)) {
      try {
        analizado = analizarGastoXml(fs.readFileSync(c.xmlPath, "utf8"));
      } catch {
        analizado = null;
      }
    }
    if (!analizado) {
      gastosSinXml++;
      continue;
    }
    // Retenciones que efectuamos a terceros (se enteran aunque el gasto no sea deducible)
    retTercerosIsr = round2(retTercerosIsr + analizado.retIsr);
    retTercerosIva = round2(retTercerosIva + analizado.retIva);
    if (c.deducible === "ok") {
      ivaAcreditablePagado = round2(ivaAcreditablePagado + analizado.traslados);
      gastosDeduciblesPagados = round2(gastosDeduciblesPagados + analizado.base);
    }
  }

  /* --- Retenciones de ISR por salarios (nómina timbrada del mes) --- */
  const recibos = await listarRecibos(empresa.id, 500);
  const isrRetenidoNomina = round2(
    recibos
      .filter((r) => r.estado === "timbrada" && enPeriodo(r.periodoFin))
      .reduce((s, r) => s + (r.calculo?.isr?.retenido ?? 0), 0),
  );

  /* --- Método de ISR --- */
  const perfilConfigurado = Boolean(cfg.perfil && cfg.perfil.regimenes.length > 0);
  const metodoIsr: MetodoIsr = cfg.regimenCalculo === "auto" ? metodoIsrDesdePerfil(cfg.perfil) : cfg.regimenCalculo;
  const aplicables = impuestosDesdePerfil(cfg.perfil);
  const aplica = (t: TipoImpuesto) => !perfilConfigurado || aplicables.has(t);

  const conceptos: PanelFiscal["conceptos"] = [];

  /* IVA mensual */
  if (aplica("iva_mensual") && (ivaCobrado > 0 || ivaAcreditablePagado > 0)) {
    const dif = round2(ivaCobrado - ivaAcreditablePagado);
    conceptos.push({
      tipo: "iva_mensual",
      titulo: IMPUESTO_LABEL.iva_mensual,
      periodicidad: "mensual",
      reglones: [
        { etiqueta: "IVA trasladado cobrado", valor: ivaCobrado },
        { etiqueta: "IVA acreditable pagado", valor: -ivaAcreditablePagado, tipo: "resta" },
      ],
      aCargo: dif,
      nota: gastosSinXml > 0 ? `${gastosSinXml} gasto(s) solo con metadata: su IVA no se acreditó aquí.` : undefined,
    });
  }

  /* ISR según el método del régimen */
  const nota = "Estimación de flujo para planeación; la declaración definitiva puede variar.";
  if (metodoIsr === "resico_pf") {
    const renglon = TABLA_RESICO.find((r) => ingresosCobrados <= r.hasta) ?? TABLA_RESICO[TABLA_RESICO.length - 1];
    const causado = round2(ingresosCobrados * renglon.tasa);
    conceptos.push({
      tipo: "isr_resico_pf",
      titulo: IMPUESTO_LABEL.isr_resico_pf,
      periodicidad: "mensual",
      reglones: [
        { etiqueta: "Ingresos cobrados (sin IVA)", valor: ingresosCobrados },
        { etiqueta: `Tasa aplicable ${(renglon.tasa * 100).toFixed(2)}%`, valor: causado },
        { etiqueta: "Retenciones de ISR (1.25%)", valor: -retencionesAcreditables, tipo: "resta" },
      ],
      aCargo: Math.max(0, round2(causado - retencionesAcreditables)),
      nota: ingresosCobrados > 3_500_000 ? "Los ingresos del mes exceden el límite RESICO ($3.5M)." : nota,
    });
  } else if (metodoIsr === "resico_pm") {
    const utilidad = Math.max(0, round2(ingresosCobrados - gastosDeduciblesPagados));
    const causado = round2(utilidad * 0.3);
    conceptos.push({
      tipo: "isr_resico_pm",
      titulo: IMPUESTO_LABEL.isr_resico_pm,
      periodicidad: "mensual",
      reglones: [
        { etiqueta: "Ingresos cobrados", valor: ingresosCobrados },
        { etiqueta: "Deducciones pagadas", valor: -gastosDeduciblesPagados, tipo: "resta" },
        { etiqueta: "Utilidad de flujo", valor: utilidad },
        { etiqueta: "ISR (30%)", valor: causado },
        { etiqueta: "Retenciones de ISR", valor: -retencionesAcreditables, tipo: "resta" },
      ],
      aCargo: Math.max(0, round2(causado - retencionesAcreditables)),
      nota,
    });
  } else if (metodoIsr === "pf_actividad") {
    const base = Math.max(0, round2(ingresosCobrados - gastosDeduciblesPagados));
    const causado = isrTarifaMensual(base);
    conceptos.push({
      tipo: "isr_provisional_pf",
      titulo: IMPUESTO_LABEL.isr_provisional_pf,
      periodicidad: "mensual",
      reglones: [
        { etiqueta: "Ingresos cobrados (sin IVA)", valor: ingresosCobrados },
        { etiqueta: "Deducciones pagadas", valor: -gastosDeduciblesPagados, tipo: "resta" },
        { etiqueta: "Base gravable", valor: base },
        { etiqueta: "ISR tarifa Art. 96", valor: causado },
        { etiqueta: "Retenciones de ISR", valor: -retencionesAcreditables, tipo: "resta" },
      ],
      aCargo: Math.max(0, round2(causado - retencionesAcreditables)),
      nota: `${nota} Es un cálculo mensual; el pago provisional real es acumulado del ejercicio.`,
    });
  } else if (metodoIsr === "arrendamiento") {
    const deduccion = cfg.deduccionCiegaArrendamiento
      ? round2(ingresosCobrados * 0.35)
      : gastosDeduciblesPagados;
    const base = Math.max(0, round2(ingresosCobrados - deduccion));
    const causado = isrTarifaMensual(base);
    conceptos.push({
      tipo: "isr_arrendamiento",
      titulo: IMPUESTO_LABEL.isr_arrendamiento,
      periodicidad: "mensual",
      reglones: [
        { etiqueta: "Ingresos cobrados (sin IVA)", valor: ingresosCobrados },
        {
          etiqueta: cfg.deduccionCiegaArrendamiento ? "Deducción opcional (35%)" : "Deducciones pagadas",
          valor: -deduccion,
          tipo: "resta",
        },
        { etiqueta: "Base gravable", valor: base },
        { etiqueta: "ISR tarifa Art. 96", valor: causado },
        { etiqueta: "Retenciones de ISR (10%)", valor: -retencionesAcreditables, tipo: "resta" },
      ],
      aCargo: Math.max(0, round2(causado - retencionesAcreditables)),
      nota,
    });
  } else if (metodoIsr === "pm_general") {
    let nominales = 0;
    for (const f of facturas.filter((f) => enPeriodo(f.fecha))) {
      const base = round2(f.subTotal - f.descuento);
      nominales = round2(nominales + (f.tipoDeComprobante === "E" ? -base : base));
    }
    const utilidad = round2(nominales * cfg.coeficienteUtilidad);
    const causado = Math.max(0, round2(utilidad * 0.3));
    conceptos.push({
      tipo: "isr_provisional_pm",
      titulo: IMPUESTO_LABEL.isr_provisional_pm,
      periodicidad: "mensual",
      reglones: [
        { etiqueta: "Ingresos nominales", valor: nominales },
        { etiqueta: `× Coeficiente de utilidad ${cfg.coeficienteUtilidad || 0}`, valor: utilidad },
        { etiqueta: "ISR (30%)", valor: causado },
        { etiqueta: "Retenciones de ISR", valor: -retencionesAcreditables, tipo: "resta" },
      ],
      aCargo: Math.max(0, round2(causado - retencionesAcreditables)),
      nota: cfg.coeficienteUtilidad > 0 ? nota : "Captura el coeficiente de utilidad para estimar el pago provisional.",
    });
  }

  /* Retenciones de ISR por salarios (nómina) */
  if (aplica("ret_isr_salarios") && isrRetenidoNomina > 0) {
    conceptos.push({
      tipo: "ret_isr_salarios",
      titulo: IMPUESTO_LABEL.ret_isr_salarios,
      periodicidad: "mensual",
      reglones: [{ etiqueta: "ISR retenido en la nómina del mes", valor: isrRetenidoNomina }],
      aCargo: isrRetenidoNomina,
      nota: "Suma del ISR retenido en los recibos de nómina timbrados del periodo.",
    });
  }

  /* Retenciones de ISR a terceros (honorarios/arrendamiento) */
  if (aplica("ret_isr_servicios") && retTercerosIsr > 0) {
    conceptos.push({
      tipo: "ret_isr_servicios",
      titulo: IMPUESTO_LABEL.ret_isr_servicios,
      periodicidad: "mensual",
      reglones: [{ etiqueta: "ISR retenido a proveedores (CFDI recibidos)", valor: retTercerosIsr }],
      aCargo: retTercerosIsr,
    });
  }

  /* Retenciones de IVA a terceros */
  if (aplica("ret_iva") && retTercerosIva > 0) {
    conceptos.push({
      tipo: "ret_iva",
      titulo: IMPUESTO_LABEL.ret_iva,
      periodicidad: "mensual",
      reglones: [{ etiqueta: "IVA retenido a proveedores (CFDI recibidos)", valor: retTercerosIva }],
      aCargo: retTercerosIva,
    });
  }

  return {
    periodo: { anio, mes },
    metodoIsr,
    perfilConfigurado,
    base: {
      ingresosCobrados,
      ivaCobrado,
      ivaAcreditablePagado,
      retencionesAcreditables,
      gastosDeduciblesPagados,
      gastosSinXml,
      retencionesTerceros: { isr: retTercerosIsr, iva: retTercerosIva },
      isrRetenidoNomina,
    },
    conceptos,
  };
}
