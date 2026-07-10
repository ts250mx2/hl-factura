import type { Emisor } from "../types";
import { listarFacturas, listarBoveda } from "../repos";
import { listarPolizas } from "./repos";
import { calcularPanelFiscal } from "./fiscal";
import { round2 } from "../sat/importes";

// Cédula de amarre: reconcilia, para un mes, lo TIMBRADO (CFDI emitidos y
// recibidos) contra lo CONTABILIZADO (pólizas) y lo DETERMINADO fiscalmente
// (panel de flujo). El emparejamiento es a nivel documento (cada CFDI contra su
// póliza de origen), lo que revela los huecos: facturas sin contabilizar, gastos
// sin póliza, y la diferencia entre el IVA devengado (CFDI) y el de flujo.

export interface DocIngresoSinPoliza {
  id: string;
  folio: string;
  receptor: string;
  fecha: string;
  total: number;
}
export interface DocGastoSinPoliza {
  uuid: string;
  emisor: string;
  fecha: string;
  total: number;
  deducible: string;
}

export interface Amarre {
  periodo: string;
  ingresos: {
    cfdi: { count: number; subtotal: number; iva: number; total: number }; // neto (notas de crédito restadas)
    conPoliza: number;
    sinPoliza: DocIngresoSinPoliza[];
    sinContabilizar: number; // suma del total de las facturas sin póliza
  };
  gastos: {
    cfdi: { count: number; total: number };
    conPoliza: number;
    sinPoliza: DocGastoSinPoliza[];
    sinContabilizar: number;
    noDeducibles: { count: number; total: number };
  };
  iva: {
    trasladadoDevengado: number; // IVA de los CFDI emitidos (devengado, neto de NC)
    trasladadoCobrado: number; // IVA efectivamente cobrado (flujo)
    acreditablePagado: number; // IVA acreditable pagado (flujo)
    aCargo: number; // resultado del IVA del periodo (panel)
  } | null;
  hallazgos: string[]; // resumen legible de las discrepancias
}

const suma = <T>(arr: T[], f: (x: T) => number) => round2(arr.reduce((s, x) => s + f(x), 0));
// Nota de crédito (tipo E): reduce el ingreso, así que su aporte va en negativo.
const signoIngreso = (tipo: string) => (tipo === "E" ? -1 : 1);

export async function calcularAmarre(empresa: Emisor, anio: string, mes: string): Promise<Amarre> {
  const periodo = `${anio}-${mes}`;
  const [facturas, recibidas, polizas, panel] = await Promise.all([
    listarFacturas([empresa.id], { estado: "timbrada", limite: 5000 }),
    listarBoveda([empresa.id], { tipo: "recibida", limite: 1000 }),
    listarPolizas(empresa.id, anio, mes),
    calcularPanelFiscal(empresa, anio, mes).catch(() => null),
  ]);

  const emitidas = facturas.filter(
    (f) => (f.fecha || "").startsWith(periodo) && (f.tipoDeComprobante === "I" || f.tipoDeComprobante === "E"),
  );
  const recPeriodo = recibidas.filter(
    (c) => (c.fecha || "").startsWith(periodo) && c.estatusSat === "vigente" && (c.tipoComprobante ?? "I") === "I",
  );

  // Emparejamiento por documento de origen de las pólizas del periodo. Se usa el
  // MATCH documental (¿cada CFDI tiene su póliza?), no una resta contra
  // póliza.total: ese total es la suma del debe (bruto, con retenciones), que no
  // coincide con el total neto del CFDI y generaba diferencias falsas.
  const conPolizaFactura = new Set(polizas.filter((p) => p.origenTipo === "factura").map((p) => p.origenId));
  const conPolizaGasto = new Set(polizas.filter((p) => p.origenTipo === "gasto").map((p) => p.origenId));

  /* ---- Ingresos (neto: las notas de crédito restan) ---- */
  const ingSinPoliza = emitidas.filter((f) => !conPolizaFactura.has(f.id));
  const ingresos = {
    cfdi: {
      count: emitidas.length,
      subtotal: suma(emitidas, (f) => signoIngreso(f.tipoDeComprobante) * (f.subTotal - f.descuento)),
      iva: suma(emitidas, (f) => signoIngreso(f.tipoDeComprobante) * f.totalTraslados),
      total: suma(emitidas, (f) => signoIngreso(f.tipoDeComprobante) * f.total),
    },
    conPoliza: emitidas.length - ingSinPoliza.length,
    sinPoliza: ingSinPoliza.map((f) => ({
      id: f.id,
      folio: `${f.serie}-${f.folio}`,
      receptor: f.receptorNombre,
      fecha: (f.fecha || "").slice(0, 10),
      total: f.total,
    })),
    sinContabilizar: suma(ingSinPoliza, (f) => f.total),
  };

  /* ---- Gastos ---- */
  const gasSinPoliza = recPeriodo.filter((c) => !conPolizaGasto.has(c.uuid));
  const noDed = recPeriodo.filter((c) => c.deducible !== "ok");
  const gastos = {
    cfdi: { count: recPeriodo.length, total: suma(recPeriodo, (c) => c.total) },
    conPoliza: recPeriodo.length - gasSinPoliza.length,
    sinPoliza: gasSinPoliza.map((c) => ({
      uuid: c.uuid,
      emisor: c.emisorNombre || c.emisorRfc,
      fecha: (c.fecha || "").slice(0, 10),
      total: c.total,
      deducible: c.deducible,
    })),
    sinContabilizar: suma(gasSinPoliza, (c) => c.total),
    noDeducibles: { count: noDed.length, total: suma(noDed, (c) => c.total) },
  };

  /* ---- IVA (flujo, del panel fiscal) ---- */
  let iva: Amarre["iva"] = null;
  if (panel) {
    const ivaConcepto = panel.conceptos.find((c) => c.tipo === "iva_mensual");
    iva = {
      trasladadoDevengado: ingresos.cfdi.iva,
      trasladadoCobrado: round2(panel.base.ivaCobrado),
      acreditablePagado: round2(panel.base.ivaAcreditablePagado),
      aCargo: round2(ivaConcepto?.aCargo ?? 0),
    };
  }

  /* ---- Hallazgos (resumen legible) ---- */
  const hallazgos: string[] = [];
  if (ingresos.sinPoliza.length)
    hallazgos.push(`${ingresos.sinPoliza.length} factura(s) timbrada(s) sin contabilizar por ${money(ingresos.sinContabilizar)}. Genera las pólizas del periodo.`);
  if (gastos.sinPoliza.length)
    hallazgos.push(`${gastos.sinPoliza.length} CFDI recibido(s) sin póliza por ${money(gastos.sinContabilizar)}.`);
  if (gastos.noDeducibles.count)
    hallazgos.push(`${gastos.noDeducibles.count} gasto(s) NO deducible(s)/EFOS por ${money(gastos.noDeducibles.total)} colados en el periodo — revísalos antes de deducir.`);
  if (iva && Math.abs(iva.trasladadoDevengado - iva.trasladadoCobrado) > 0.5)
    hallazgos.push(`IVA trasladado devengado (${money(iva.trasladadoDevengado)}) vs cobrado (${money(iva.trasladadoCobrado)}): la diferencia son facturas por cobrar (PPD) cuyo IVA aún no se causa en flujo.`);
  if (!hallazgos.length) hallazgos.push("Sin discrepancias: todos los CFDI del periodo están contabilizados.");

  return { periodo, ingresos, gastos, iva, hallazgos };
}

function money(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
