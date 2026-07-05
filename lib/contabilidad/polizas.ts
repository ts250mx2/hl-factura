import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import type { Emisor, Factura, MovimientoPoliza, PagoRep, TipoPoliza } from "../types";
import { listarFacturas, listarPagosRep, listarBoveda } from "../repos";
import { round2 } from "../sat/importes";
import { CTA } from "./catalogo";
import {
  sembrarCatalogo,
  insertarPoliza,
  eliminarPolizasPeriodo,
  listarReglas,
  listarActivos,
} from "./repos";

// Motor de pólizas automáticas: lee los CFDI del periodo (emitidos, cobros REP
// y gastos de la bóveda) y genera las pólizas de ingresos/egresos/diario con
// cargos y abonos cuadrados. Las reglas contables permiten dirigir cada
// proveedor o clave de producto a una cuenta de gasto específica.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

interface MontosCfdi {
  subTotal: number;
  descuento: number;
  traslados: number;
  retenciones: number;
  total: number;
  primeraClave?: string;
}

/** Extrae los montos fiscales de un XML de la bóveda (para pólizas de gasto). */
export function parseMontosCfdi(xml: string): MontosCfdi {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const comp = (Array.isArray(doc.Comprobante) ? doc.Comprobante[0] : doc.Comprobante) as
    | Record<string, unknown>
    | undefined;
  if (!comp) throw new Error("XML sin Comprobante");
  const attr = (n: Record<string, unknown> | undefined, k: string) =>
    n?.[`@${k}`] !== undefined ? String(n[`@${k}`]) : undefined;
  const imp = (Array.isArray(comp.Impuestos) ? comp.Impuestos[0] : comp.Impuestos) as
    | Record<string, unknown>
    | undefined;
  const conceptos = (Array.isArray(comp.Conceptos) ? comp.Conceptos[0] : comp.Conceptos) as
    | Record<string, unknown>
    | undefined;
  const primerConcepto = conceptos
    ? ((Array.isArray(conceptos.Concepto) ? conceptos.Concepto[0] : conceptos.Concepto) as
        | Record<string, unknown>
        | undefined)
    : undefined;
  return {
    subTotal: Number(attr(comp, "SubTotal") ?? 0),
    descuento: Number(attr(comp, "Descuento") ?? 0),
    traslados: Number(attr(imp, "TotalImpuestosTrasladados") ?? 0),
    retenciones: Number(attr(imp, "TotalImpuestosRetenidos") ?? 0),
    total: Number(attr(comp, "Total") ?? 0),
    primeraClave: attr(primerConcepto, "ClaveProdServ"),
  };
}

function mov(cuenta: string, nombre: string, debe: number, haber: number): MovimientoPoliza {
  return { cuenta, nombreCuenta: nombre, debe: round2(debe), haber: round2(haber) };
}

function limpiar(movs: MovimientoPoliza[]): MovimientoPoliza[] {
  return movs.filter((m) => m.debe > 0.004 || m.haber > 0.004);
}

function cuadrada(movs: MovimientoPoliza[]): boolean {
  const debe = round2(movs.reduce((s, m) => s + m.debe, 0));
  const haber = round2(movs.reduce((s, m) => s + m.haber, 0));
  return Math.abs(debe - haber) < 0.01;
}

export interface ResultadoGeneracion {
  creadas: number;
  omitidas: number; // ya existían
  descuadradas: number;
  detalle: string[];
}

export async function generarPolizasPeriodo(
  empresa: Emisor,
  anio: string,
  mes: string,
  opts?: { regenerar?: boolean },
): Promise<ResultadoGeneracion> {
  const cuentas = await sembrarCatalogo(empresa.id);
  const nombreDe = (codigo: string) => cuentas.find((c) => c.codigo === codigo)?.nombre ?? codigo;
  const reglas = await listarReglas(empresa.id);
  const resultado: ResultadoGeneracion = { creadas: 0, omitidas: 0, descuadradas: 0, detalle: [] };

  if (opts?.regenerar) {
    await eliminarPolizasPeriodo(empresa.id, anio, mes);
  }

  const enPeriodo = (fecha: string) => fecha.startsWith(`${anio}-${mes}`);

  const registrar = async (
    tipo: TipoPoliza,
    fecha: string,
    concepto: string,
    origenTipo: "factura" | "pago" | "gasto" | "depreciacion",
    origenId: string,
    movimientos: MovimientoPoliza[],
  ) => {
    const movs = limpiar(movimientos);
    if (movs.length === 0) return;
    if (!cuadrada(movs)) {
      resultado.descuadradas++;
      resultado.detalle.push(`Descuadre en ${origenTipo} ${origenId} — se omitió`);
      return;
    }
    const nueva = await insertarPoliza({
      empresaId: empresa.id,
      tipo,
      fecha,
      mes,
      anio,
      concepto,
      origenTipo,
      origenId,
      movimientos: movs,
      total: round2(movs.reduce((s, m) => s + m.debe, 0)),
    });
    if (nueva) resultado.creadas++;
    else resultado.omitidas++;
  };

  /* --- 1. Facturas emitidas del periodo --- */
  const facturas = (await listarFacturas([empresa.id])).filter(
    (f) => f.estado === "timbrada" && enPeriodo(f.fecha),
  );
  for (const f of facturas) {
    const base = round2(f.subTotal - f.descuento);
    const fecha = f.fecha.slice(0, 10);
    if (f.tipoDeComprobante === "E") {
      // Nota de crédito: revierte ingreso
      await registrar("diario", fecha, `NC ${f.serie}-${f.folio} ${f.receptorNombre}`, "factura", f.id, [
        mov(CTA.DESCUENTOS, nombreDe(CTA.DESCUENTOS), base, 0),
        mov(CTA.IVA_TRAS, nombreDe(CTA.IVA_TRAS), f.totalTraslados, 0),
        mov(CTA.CLIENTES, nombreDe(CTA.CLIENTES), 0, f.total),
        mov(CTA.RET_FAVOR, nombreDe(CTA.RET_FAVOR), 0, f.totalRetenciones),
      ]);
      continue;
    }
    if (f.metodoPago === "PUE") {
      const ctaCobro = f.formaPago === "01" ? CTA.CAJA : CTA.BANCOS;
      await registrar("ingresos", fecha, `Factura ${f.serie}-${f.folio} ${f.receptorNombre} (PUE)`, "factura", f.id, [
        mov(ctaCobro, nombreDe(ctaCobro), f.total, 0),
        mov(CTA.RET_FAVOR, nombreDe(CTA.RET_FAVOR), f.totalRetenciones, 0),
        mov(CTA.VENTAS, nombreDe(CTA.VENTAS), 0, base),
        mov(CTA.IVA_TRAS, nombreDe(CTA.IVA_TRAS), 0, f.totalTraslados),
      ]);
    } else {
      // PPD: se reconoce el ingreso y el IVA queda pendiente de cobro
      await registrar("ingresos", fecha, `Factura ${f.serie}-${f.folio} ${f.receptorNombre} (PPD)`, "factura", f.id, [
        mov(CTA.CLIENTES, nombreDe(CTA.CLIENTES), f.total, 0),
        mov(CTA.RET_FAVOR, nombreDe(CTA.RET_FAVOR), f.totalRetenciones, 0),
        mov(CTA.VENTAS, nombreDe(CTA.VENTAS), 0, base),
        mov(CTA.IVA_TRAS_PEND, nombreDe(CTA.IVA_TRAS_PEND), 0, f.totalTraslados),
      ]);
    }
  }

  /* --- 2. Cobros (complementos de pago) del periodo --- */
  const pagos = (await listarPagosRep([empresa.id])).filter(
    (p: PagoRep) => p.estado === "timbrada" && enPeriodo(p.fechaPago),
  );
  for (const p of pagos) {
    const fecha = p.fechaPago.slice(0, 10);
    const ctaCobro = p.formaPago === "01" ? CTA.CAJA : CTA.BANCOS;
    const ivaCobrado = round2(
      p.doctos.reduce(
        (s, d) => s + d.impuestos.filter((i) => !i.esRetencion && i.impuesto === "002").reduce((x, i) => x + (i.importe ?? 0), 0),
        0,
      ),
    );
    const movs = [
      mov(ctaCobro, nombreDe(ctaCobro), p.monto, 0),
      mov(CTA.CLIENTES, nombreDe(CTA.CLIENTES), 0, p.monto),
    ];
    if (ivaCobrado > 0) {
      // Reclasificación: el IVA pendiente se vuelve IVA cobrado
      movs.push(mov(CTA.IVA_TRAS_PEND, nombreDe(CTA.IVA_TRAS_PEND), ivaCobrado, 0));
      movs.push(mov(CTA.IVA_TRAS, nombreDe(CTA.IVA_TRAS), 0, ivaCobrado));
    }
    await registrar("ingresos", fecha, `Cobro REP ${p.serie}-${p.folio} ${p.receptorNombre}`, "pago", p.id, movs);
  }

  /* --- 3. Gastos (CFDI recibidos en la bóveda) del periodo --- */
  const recibidas = (await listarBoveda([empresa.id], { tipo: "recibida", limite: 1000 })).filter(
    (c) => enPeriodo(c.fecha) && c.estatusSat === "vigente" && (c.tipoComprobante ?? "I") === "I",
  );
  for (const c of recibidas) {
    const fecha = c.fecha.slice(0, 10);
    let montos: MontosCfdi = { subTotal: c.total, descuento: 0, traslados: 0, retenciones: 0, total: c.total };
    if (c.xmlPath && fs.existsSync(c.xmlPath)) {
      try {
        montos = parseMontosCfdi(fs.readFileSync(c.xmlPath, "utf8"));
      } catch {
        /* solo metadata utilizable */
      }
    }
    const base = round2(montos.subTotal - montos.descuento);

    // Cuenta de gasto: no deducible > regla por RFC > regla por clave > general
    let ctaGasto: string = CTA.GASTOS;
    if (c.deducible !== "ok") {
      ctaGasto = CTA.NO_DEDUCIBLE;
    } else {
      const porRfc = reglas.find((r) => r.criterio === "rfc" && r.valor === c.emisorRfc);
      const porClave = montos.primeraClave
        ? reglas.find((r) => r.criterio === "claveProdServ" && montos.primeraClave!.startsWith(r.valor))
        : undefined;
      ctaGasto = porRfc?.cuentaCodigo ?? porClave?.cuentaCodigo ?? CTA.GASTOS;
    }

    const esPPD = c.metodoPago === "PPD";
    const ctaIva = c.deducible !== "ok" ? null : esPPD ? CTA.IVA_ACRED_PEND : CTA.IVA_ACRED;
    const ctaPago = esPPD ? CTA.PROVEEDORES : c.formaPago === "01" ? CTA.CAJA : CTA.BANCOS;

    const movs = [
      // Si no es deducible, todo el total va al gasto no deducible (sin IVA acreditable)
      mov(ctaGasto, nombreDe(ctaGasto), ctaIva ? base : montos.total, 0),
      ...(ctaIva ? [mov(ctaIva, nombreDe(ctaIva), montos.traslados, 0)] : []),
      mov(ctaPago, nombreDe(ctaPago), 0, montos.total),
      ...(montos.retenciones > 0 && ctaIva
        ? [mov(CTA.RET_POR_PAGAR, nombreDe(CTA.RET_POR_PAGAR), 0, montos.retenciones)]
        : []),
    ];
    await registrar(
      "egresos",
      fecha,
      `Gasto ${c.emisorNombre || c.emisorRfc} ${c.uuid.slice(0, 8)}${c.deducible !== "ok" ? " (NO deducible)" : ""}`,
      "gasto",
      c.uuid,
      movs,
    );
  }

  /* --- 4. Depreciación mensual de activos fijos --- */
  const activos = await listarActivos(empresa.id);
  const finPeriodo = new Date(Number(anio), Number(mes), 0); // último día del mes
  let depTotal = 0;
  const detalleDep: string[] = [];
  for (const a of activos) {
    const adquisicion = new Date(a.fechaAdquisicion + "T00:00:00");
    if (adquisicion > finPeriodo) continue;
    const mensual = round2((a.moi * (a.tasaAnual / 100)) / 12);
    // Meses completos transcurridos desde la adquisición hasta el INICIO del periodo
    const mesesPrevios = Math.max(
      0,
      (Number(anio) - adquisicion.getFullYear()) * 12 + (Number(mes) - 1 - adquisicion.getMonth()),
    );
    const acumulada = Math.min(round2(mensual * mesesPrevios), a.moi);
    const restante = round2(a.moi - acumulada);
    const delMes = Math.min(mensual, restante);
    if (delMes > 0.004) {
      depTotal = round2(depTotal + delMes);
      detalleDep.push(a.descripcion);
    }
  }
  if (depTotal > 0) {
    await registrar(
      "diario",
      `${anio}-${mes}-28`,
      `Depreciación mensual (${detalleDep.length} activo(s))`,
      "depreciacion",
      `${anio}-${mes}`,
      [
        mov(CTA.GASTO_DEP, nombreDe(CTA.GASTO_DEP), depTotal, 0),
        mov(CTA.DEP_ACUM, nombreDe(CTA.DEP_ACUM), 0, depTotal),
      ],
    );
  }

  return resultado;
}
