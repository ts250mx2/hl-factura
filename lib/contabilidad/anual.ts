import { cargarXmlsCfdi } from "../archivos";
import type { Emisor, MetodoIsr } from "../types";
import { listarFacturas, listarPagosRep, listarBoveda, getFactura } from "../repos";
import { round2 } from "../sat/importes";
import { getConfigFiscal, listarActivos } from "./repos";
import { metodoIsrDesdePerfil } from "./obligaciones";
import { parseMontosCfdi } from "./polizas";

// Declaración anual pre-llenada: acumula el ejercicio completo (ingresos,
// deducciones, retenciones) desde los CFDI y aplica el método anual del régimen.
// Los pagos provisionales y las deducciones personales/PTU los captura el usuario.

/** Tarifa ANUAL del ISR (Art. 152 LISR). */
const TARIFA_ISR_ANUAL: { li: number; cuota: number; pct: number }[] = [
  { li: 0.01, cuota: 0, pct: 0.0192 },
  { li: 8952.5, cuota: 171.88, pct: 0.064 },
  { li: 75984.56, cuota: 4461.94, pct: 0.1088 },
  { li: 133536.08, cuota: 10723.55, pct: 0.16 },
  { li: 155229.81, cuota: 14194.54, pct: 0.1792 },
  { li: 185852.58, cuota: 19682.13, pct: 0.2136 },
  { li: 374837.89, cuota: 60049.4, pct: 0.2352 },
  { li: 590796.0, cuota: 110842.74, pct: 0.3 },
  { li: 1127926.85, cuota: 271981.99, pct: 0.32 },
  { li: 1503902.47, cuota: 392294.17, pct: 0.34 },
  { li: 4511707.38, cuota: 1414947.85, pct: 0.35 },
];

function isrTarifaAnual(base: number): number {
  if (base <= 0) return 0;
  let renglon = TARIFA_ISR_ANUAL[0];
  for (const r of TARIFA_ISR_ANUAL) if (base >= r.li) renglon = r;
  return round2(renglon.cuota + (base - renglon.li) * renglon.pct);
}

/** Tabla ANUAL del ISR RESICO personas físicas (Art. 113-F LISR). */
const TABLA_RESICO_ANUAL: { hasta: number; tasa: number }[] = [
  { hasta: 300_000, tasa: 0.01 },
  { hasta: 600_000, tasa: 0.011 },
  { hasta: 1_000_000, tasa: 0.015 },
  { hasta: 2_500_000, tasa: 0.02 },
  { hasta: 3_500_000, tasa: 0.025 },
];

export interface AjustesAnual {
  deduccionesPersonales: number;
  pagosProvisionales: number;
  ptuPagada: number;
  perdidasFiscales: number;
}

export interface DeclaracionAnual {
  anio: string;
  metodo: MetodoIsr;
  baseIngresos: "cobrados" | "nominales";
  aplicaDeducciones: boolean;
  aplicaPersonales: boolean;
  aplicaPtu: boolean;
  ingresos: number;
  deduccionesAutorizadas: number;
  depreciacion: number; // incluida en deduccionesAutorizadas
  deduccionesPersonales: number;
  ptuPagada: number;
  perdidasFiscales: number;
  utilidadFiscal: number;
  baseGravable: number;
  isrCausado: number;
  retenciones: number;
  pagosProvisionales: number;
  isrACargo: number; // >0 a pagar, <0 a favor
  iva: { cobrado: number; acreditable: number };
  gastosSinXml: number;
}

/** Depreciación fiscal del ejercicio (suma de la mensual de cada activo). */
async function depreciacionAnual(empresaId: string, anio: string): Promise<number> {
  const activos = await listarActivos(empresaId);
  let total = 0;
  for (const a of activos) {
    const adquisicion = new Date(a.fechaAdquisicion + "T00:00:00");
    const mensual = round2((a.moi * (a.tasaAnual / 100)) / 12);
    for (let m = 1; m <= 12; m++) {
      const finMes = new Date(Number(anio), m, 0);
      if (adquisicion > finMes) continue;
      const mesesPrevios = Math.max(0, (Number(anio) - adquisicion.getFullYear()) * 12 + (m - 1 - adquisicion.getMonth()));
      const acumulada = Math.min(round2(mensual * mesesPrevios), a.moi);
      const restante = round2(a.moi - acumulada);
      const delMes = Math.min(mensual, restante);
      if (delMes > 0.004) total = round2(total + delMes);
    }
  }
  return total;
}

export async function calcularAnual(empresa: Emisor, anio: string, ajustes: AjustesAnual): Promise<DeclaracionAnual> {
  const cfg = await getConfigFiscal(empresa.id);
  const metodo: MetodoIsr = cfg.regimenCalculo === "auto" ? metodoIsrDesdePerfil(cfg.perfil) : cfg.regimenCalculo;
  const delAnio = (fecha: string) => fecha.startsWith(anio);
  const facturas = (await listarFacturas([empresa.id])).filter((f) => f.estado === "timbrada");

  /* Ingresos devengados (nominales) y cobrados (flujo), con sus retenciones */
  let ingresosDevengados = 0;
  let retencionesDevengadas = 0;
  for (const f of facturas.filter((f) => delAnio(f.fecha))) {
    const base = round2(f.subTotal - f.descuento);
    ingresosDevengados = round2(ingresosDevengados + (f.tipoDeComprobante === "E" ? -base : base));
    retencionesDevengadas = round2(retencionesDevengadas + (f.tipoDeComprobante === "E" ? -f.totalRetenciones : f.totalRetenciones));
  }

  let ingresosCobrados = 0;
  let ivaCobrado = 0;
  let retencionesCobradas = 0;
  for (const f of facturas.filter((f) => f.metodoPago === "PUE" && f.tipoDeComprobante === "I" && delAnio(f.fecha))) {
    ingresosCobrados = round2(ingresosCobrados + (f.subTotal - f.descuento));
    ivaCobrado = round2(ivaCobrado + f.totalTraslados);
    retencionesCobradas = round2(retencionesCobradas + f.totalRetenciones);
  }
  const pagos = (await listarPagosRep([empresa.id])).filter((p) => p.estado === "timbrada" && delAnio(p.fechaPago));
  for (const p of pagos) {
    for (const d of p.doctos) {
      const f = facturas.find((x) => x.id === d.facturaId) ?? (await getFactura(d.facturaId));
      if (!f || f.total <= 0) continue;
      const factor = d.pagado / f.total;
      ingresosCobrados = round2(ingresosCobrados + (f.subTotal - f.descuento) * factor);
      retencionesCobradas = round2(retencionesCobradas + f.totalRetenciones * factor);
      ivaCobrado = round2(
        ivaCobrado + d.impuestos.filter((i) => !i.esRetencion && i.impuesto === "002").reduce((s, i) => s + (i.importe ?? 0), 0),
      );
    }
  }

  /* Deducciones autorizadas pagadas (gastos deducibles PUE) + IVA acreditable */
  let deduccionesGastos = 0;
  let ivaAcreditable = 0;
  let gastosSinXml = 0;
  const recibidas = (await listarBoveda([empresa.id], { tipo: "recibida", limite: 5000 })).filter(
    (c) => delAnio(c.fecha) && c.estatusSat === "vigente" && c.deducible === "ok" && (c.tipoComprobante ?? "I") === "I" && c.metodoPago !== "PPD",
  );
  const xmlsGastos = await cargarXmlsCfdi(empresa.id, recibidas);
  for (const c of recibidas) {
    const xml = xmlsGastos.get(c.uuid);
    if (xml) {
      try {
        const m = parseMontosCfdi(xml);
        deduccionesGastos = round2(deduccionesGastos + (m.subTotal - m.descuento));
        ivaAcreditable = round2(ivaAcreditable + m.traslados);
        continue;
      } catch {
        /* cae a sin XML */
      }
    }
    gastosSinXml++;
  }

  const depreciacion = await depreciacionAnual(empresa.id, anio);

  /* --- Método anual según régimen --- */
  const esPm = metodo === "pm_general" || metodo === "resico_pm";
  const esResicoPf = metodo === "resico_pf";
  const aplicaDeducciones = !esResicoPf && metodo !== "ninguno";
  const baseIngresos: "cobrados" | "nominales" = esPm ? "nominales" : "cobrados";

  const ingresos = esPm ? ingresosDevengados : ingresosCobrados;
  const retenciones = esPm ? retencionesDevengadas : retencionesCobradas;

  let deduccionesAutorizadas = 0;
  if (aplicaDeducciones) {
    if (metodo === "arrendamiento" && cfg.deduccionCiegaArrendamiento) {
      deduccionesAutorizadas = round2(ingresos * 0.35);
    } else {
      deduccionesAutorizadas = round2(deduccionesGastos + depreciacion);
    }
  }

  const deduccionesPersonales = aplicaDeducciones && !esPm ? Math.max(0, ajustes.deduccionesPersonales) : 0;
  const ptuPagada = esPm ? Math.max(0, ajustes.ptuPagada) : 0;
  const perdidasFiscales = esPm ? Math.max(0, ajustes.perdidasFiscales) : 0;

  const utilidadFiscal = round2(ingresos - deduccionesAutorizadas);
  let baseGravable: number;
  let isrCausado: number;

  if (esResicoPf) {
    baseGravable = ingresos;
    const renglon = TABLA_RESICO_ANUAL.find((r) => ingresos <= r.hasta) ?? TABLA_RESICO_ANUAL[TABLA_RESICO_ANUAL.length - 1];
    isrCausado = round2(ingresos * renglon.tasa);
  } else if (esPm) {
    baseGravable = Math.max(0, round2(utilidadFiscal - ptuPagada - perdidasFiscales));
    isrCausado = round2(baseGravable * 0.3);
  } else if (metodo === "ninguno") {
    baseGravable = 0;
    isrCausado = 0;
  } else {
    baseGravable = Math.max(0, round2(utilidadFiscal - deduccionesPersonales));
    isrCausado = isrTarifaAnual(baseGravable);
  }

  const pagosProvisionales = Math.max(0, ajustes.pagosProvisionales);
  const isrACargo = round2(isrCausado - retenciones - pagosProvisionales);

  return {
    anio,
    metodo,
    baseIngresos,
    aplicaDeducciones,
    aplicaPersonales: aplicaDeducciones && !esPm,
    aplicaPtu: esPm,
    ingresos,
    deduccionesAutorizadas,
    depreciacion,
    deduccionesPersonales,
    ptuPagada,
    perdidasFiscales,
    utilidadFiscal,
    baseGravable,
    isrCausado,
    retenciones,
    pagosProvisionales,
    isrACargo,
    iva: { cobrado: ivaCobrado, acreditable: ivaAcreditable },
    gastosSinXml,
  };
}
