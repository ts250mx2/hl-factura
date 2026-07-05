import type { Cliente, Emisor, Factura, PagoRep, DoctoPago, ImpuestoDR } from "../types";
import type { ComprobanteCfdi } from "./cfdi";
import { buildCfdiXml, insertarComplemento, escapeXml } from "./cfdi";
import { partesComprobante, nuevoAcumulador } from "./cadena-original";
import { fmtImporte, fmtTasa, round2 } from "./importes";

// Complemento para Recepción de Pagos 2.0 (REP): CFDI tipo "P" que documenta
// los pagos recibidos contra facturas PPD, con impuestos proporcionales por
// documento (ImpuestosDR), agregados del pago (ImpuestosP) y Totales.

export const IMPUESTO_ISR = "001";
export const IMPUESTO_IVA = "002";
export const IMPUESTO_IEPS = "003";

interface GrupoImpuesto {
  esRetencion: boolean;
  impuesto: string;
  tipoFactor: "Tasa" | "Exento";
  tasa?: number;
  base: number;
  importe: number;
}

/** Extrae los grupos de impuestos de la factura original (para prorratear). */
function gruposDeFactura(f: Factura): GrupoImpuesto[] {
  const grupos = new Map<string, GrupoImpuesto>();
  const acumular = (g: GrupoImpuesto) => {
    const k = `${g.esRetencion ? "R" : "T"}|${g.impuesto}|${g.tipoFactor}|${g.tasa ?? ""}`;
    const previo = grupos.get(k);
    if (previo) {
      previo.base = round2(previo.base + g.base);
      previo.importe = round2(previo.importe + g.importe);
    } else {
      grupos.set(k, { ...g });
    }
  };
  for (const c of f.conceptos) {
    if (c.objetoImp !== "02") continue;
    if (c.impuestos.ivaExento) {
      acumular({ esRetencion: false, impuesto: IMPUESTO_IVA, tipoFactor: "Exento", base: c.base, importe: 0 });
    } else if (c.impuestos.ivaTasa !== null) {
      acumular({ esRetencion: false, impuesto: IMPUESTO_IVA, tipoFactor: "Tasa", tasa: c.impuestos.ivaTasa, base: c.base, importe: c.ivaImporte });
    }
    if (c.impuestos.iepsTasa) {
      acumular({ esRetencion: false, impuesto: IMPUESTO_IEPS, tipoFactor: "Tasa", tasa: c.impuestos.iepsTasa, base: c.base, importe: c.iepsImporte });
    }
    if (c.impuestos.retIsrTasa) {
      acumular({ esRetencion: true, impuesto: IMPUESTO_ISR, tipoFactor: "Tasa", tasa: c.impuestos.retIsrTasa, base: c.base, importe: c.retIsrImporte });
    }
    if (c.impuestos.retIvaTasa) {
      acumular({ esRetencion: true, impuesto: IMPUESTO_IVA, tipoFactor: "Tasa", tasa: c.impuestos.retIvaTasa, base: c.base, importe: c.retIvaImporte });
    }
  }
  return [...grupos.values()];
}

/** Prorratea los impuestos de la factura al monto pagado (método del SAT). */
export function impuestosProporcionales(factura: Factura, pagado: number): ImpuestoDR[] {
  const factor = factura.total > 0 ? pagado / factura.total : 0;
  return gruposDeFactura(factura).map((g) => ({
    base: round2(g.base * factor),
    impuesto: g.impuesto,
    tipoFactor: g.tipoFactor,
    tasa: g.tasa,
    importe: g.tipoFactor === "Exento" ? undefined : round2(g.importe * factor),
    esRetencion: g.esRetencion,
  }));
}

interface AgregadosPago {
  traslados: { impuesto: string; tipoFactor: "Tasa" | "Exento"; tasa?: number; base: number; importe: number }[];
  retenciones: { impuesto: string; importe: number }[];
  totales: {
    retencionesIVA?: number;
    retencionesISR?: number;
    retencionesIEPS?: number;
    trasladosBaseIVA16?: number;
    trasladosImpuestoIVA16?: number;
    trasladosBaseIVA8?: number;
    trasladosImpuestoIVA8?: number;
    trasladosBaseIVA0?: number;
    trasladosImpuestoIVA0?: number;
    trasladosBaseIVAExento?: number;
    montoTotalPagos: number;
  };
}

/** Agrega los impuestos de todos los documentos (ImpuestosP y Totales). */
export function agregarImpuestosPago(pago: PagoRep): AgregadosPago {
  const traslados = new Map<string, { impuesto: string; tipoFactor: "Tasa" | "Exento"; tasa?: number; base: number; importe: number }>();
  const retenciones = new Map<string, number>();

  for (const d of pago.doctos) {
    for (const i of d.impuestos) {
      if (i.esRetencion) {
        retenciones.set(i.impuesto, round2((retenciones.get(i.impuesto) ?? 0) + (i.importe ?? 0)));
      } else {
        const k = `${i.impuesto}|${i.tipoFactor}|${i.tasa ?? ""}`;
        const previo = traslados.get(k);
        if (previo) {
          previo.base = round2(previo.base + i.base);
          previo.importe = round2(previo.importe + (i.importe ?? 0));
        } else {
          traslados.set(k, { impuesto: i.impuesto, tipoFactor: i.tipoFactor, tasa: i.tasa, base: i.base, importe: i.importe ?? 0 });
        }
      }
    }
  }

  const t: AgregadosPago["totales"] = { montoTotalPagos: round2(pago.monto) };
  for (const g of traslados.values()) {
    if (g.impuesto !== IMPUESTO_IVA) continue;
    if (g.tipoFactor === "Exento") {
      t.trasladosBaseIVAExento = round2((t.trasladosBaseIVAExento ?? 0) + g.base);
    } else if (g.tasa === 0.16) {
      t.trasladosBaseIVA16 = round2((t.trasladosBaseIVA16 ?? 0) + g.base);
      t.trasladosImpuestoIVA16 = round2((t.trasladosImpuestoIVA16 ?? 0) + g.importe);
    } else if (g.tasa === 0.08) {
      t.trasladosBaseIVA8 = round2((t.trasladosBaseIVA8 ?? 0) + g.base);
      t.trasladosImpuestoIVA8 = round2((t.trasladosImpuestoIVA8 ?? 0) + g.importe);
    } else if (g.tasa === 0) {
      t.trasladosBaseIVA0 = round2((t.trasladosBaseIVA0 ?? 0) + g.base);
      t.trasladosImpuestoIVA0 = round2((t.trasladosImpuestoIVA0 ?? 0) + g.importe);
    }
  }
  if (retenciones.has(IMPUESTO_IVA)) t.retencionesIVA = retenciones.get(IMPUESTO_IVA);
  if (retenciones.has(IMPUESTO_ISR)) t.retencionesISR = retenciones.get(IMPUESTO_ISR);
  if (retenciones.has(IMPUESTO_IEPS)) t.retencionesIEPS = retenciones.get(IMPUESTO_IEPS);

  return {
    traslados: [...traslados.values()],
    retenciones: [...retenciones.entries()].map(([impuesto, importe]) => ({ impuesto, importe })),
    totales: t,
  };
}

/** Comprobante base del REP (los valores fijos que exige el Anexo 20 para tipo P). */
export function construirComprobantePago(
  empresa: Emisor,
  cliente: Cliente,
  pago: PagoRep,
  fecha: string,
  certificadoBase64: string,
  noCertificado: string,
): ComprobanteCfdi {
  return {
    Version: "4.0",
    Serie: pago.serie,
    Folio: pago.folio,
    Fecha: fecha,
    NoCertificado: noCertificado,
    Certificado: certificadoBase64,
    SubTotal: "0",
    Moneda: "XXX",
    Total: "0",
    TipoDeComprobante: "P",
    Exportacion: "01",
    LugarExpedicion: empresa.codigoPostal,
    Emisor: {
      Rfc: empresa.rfc,
      Nombre: empresa.nombre.replace(/\s+/g, " ").trim().toUpperCase(),
      RegimenFiscal: empresa.regimenFiscal,
    },
    Receptor: {
      Rfc: cliente.rfc,
      Nombre: cliente.nombre.replace(/\s+/g, " ").trim().toUpperCase(),
      DomicilioFiscalReceptor: cliente.codigoPostal,
      RegimenFiscalReceptor: cliente.regimenFiscal,
      UsoCFDI: "CP01",
    },
    Conceptos: [
      {
        ClaveProdServ: "84111506",
        Cantidad: "1",
        ClaveUnidad: "ACT",
        Descripcion: "Pago",
        ValorUnitario: "0",
        Importe: "0",
        ObjetoImp: "01",
      },
    ],
  };
}

const fmtTotal = (v?: number) => (v === undefined ? undefined : fmtImporte(v));

/** XML del complemento pago20:Pagos. */
export function xmlPagos(pago: PagoRep, agregados: AgregadosPago): string {
  const t = agregados.totales;
  const attrs = (pares: [string, string | undefined][]) =>
    pares
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => ` ${k}="${escapeXml(v as string)}"`)
      .join("");

  const lineas: string[] = [];
  lineas.push(`<pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="2.0">`);
  lineas.push(
    `      <pago20:Totales${attrs([
      ["TotalRetencionesIVA", fmtTotal(t.retencionesIVA)],
      ["TotalRetencionesISR", fmtTotal(t.retencionesISR)],
      ["TotalRetencionesIEPS", fmtTotal(t.retencionesIEPS)],
      ["TotalTrasladosBaseIVA16", fmtTotal(t.trasladosBaseIVA16)],
      ["TotalTrasladosImpuestoIVA16", fmtTotal(t.trasladosImpuestoIVA16)],
      ["TotalTrasladosBaseIVA8", fmtTotal(t.trasladosBaseIVA8)],
      ["TotalTrasladosImpuestoIVA8", fmtTotal(t.trasladosImpuestoIVA8)],
      ["TotalTrasladosBaseIVA0", fmtTotal(t.trasladosBaseIVA0)],
      ["TotalTrasladosImpuestoIVA0", fmtTotal(t.trasladosImpuestoIVA0)],
      ["TotalTrasladosBaseIVAExento", fmtTotal(t.trasladosBaseIVAExento)],
      ["MontoTotalPagos", fmtImporte(t.montoTotalPagos)],
    ])}/>`,
  );
  lineas.push(
    `      <pago20:Pago${attrs([
      ["FechaPago", pago.fechaPago],
      ["FormaDePagoP", pago.formaPago],
      ["MonedaP", pago.moneda],
      ["TipoCambioP", pago.moneda === "MXN" ? "1" : undefined],
      ["Monto", fmtImporte(pago.monto)],
    ])}>`,
  );

  for (const d of pago.doctos) {
    const trasladosDR = d.impuestos.filter((i) => !i.esRetencion);
    const retencionesDR = d.impuestos.filter((i) => i.esRetencion);
    const tieneImpuestos = d.objetoImpDR === "02" && (trasladosDR.length > 0 || retencionesDR.length > 0);
    const doctoAttrs = attrs([
      ["IdDocumento", d.uuid],
      ["Serie", d.serie],
      ["Folio", d.folio],
      ["MonedaDR", pago.moneda],
      ["EquivalenciaDR", "1"],
      ["NumParcialidad", String(d.parcialidad)],
      ["ImpSaldoAnt", fmtImporte(d.saldoAnterior)],
      ["ImpPagado", fmtImporte(d.pagado)],
      ["ImpSaldoInsoluto", fmtImporte(d.saldoInsoluto)],
      ["ObjetoImpDR", d.objetoImpDR],
    ]);
    if (!tieneImpuestos) {
      lineas.push(`        <pago20:DoctoRelacionado${doctoAttrs}/>`);
      continue;
    }
    lineas.push(`        <pago20:DoctoRelacionado${doctoAttrs}>`);
    lineas.push(`          <pago20:ImpuestosDR>`);
    if (retencionesDR.length) {
      lineas.push(`            <pago20:RetencionesDR>`);
      for (const i of retencionesDR) {
        lineas.push(
          `              <pago20:RetencionDR${attrs([
            ["BaseDR", fmtImporte(i.base)],
            ["ImpuestoDR", i.impuesto],
            ["TipoFactorDR", i.tipoFactor],
            ["TasaOCuotaDR", i.tasa !== undefined ? fmtTasa(i.tasa) : undefined],
            ["ImporteDR", fmtTotal(i.importe)],
          ])}/>`,
        );
      }
      lineas.push(`            </pago20:RetencionesDR>`);
    }
    if (trasladosDR.length) {
      lineas.push(`            <pago20:TrasladosDR>`);
      for (const i of trasladosDR) {
        lineas.push(
          `              <pago20:TrasladoDR${attrs([
            ["BaseDR", fmtImporte(i.base)],
            ["ImpuestoDR", i.impuesto],
            ["TipoFactorDR", i.tipoFactor],
            ["TasaOCuotaDR", i.tipoFactor === "Exento" ? undefined : i.tasa !== undefined ? fmtTasa(i.tasa) : undefined],
            ["ImporteDR", i.tipoFactor === "Exento" ? undefined : fmtTotal(i.importe)],
          ])}/>`,
        );
      }
      lineas.push(`            </pago20:TrasladosDR>`);
    }
    lineas.push(`          </pago20:ImpuestosDR>`);
    lineas.push(`        </pago20:DoctoRelacionado>`);
  }

  const hayImpuestosP = agregados.traslados.length > 0 || agregados.retenciones.length > 0;
  if (hayImpuestosP) {
    lineas.push(`        <pago20:ImpuestosP>`);
    if (agregados.retenciones.length) {
      lineas.push(`          <pago20:RetencionesP>`);
      for (const r of agregados.retenciones) {
        lineas.push(`            <pago20:RetencionP${attrs([["ImpuestoP", r.impuesto], ["ImporteP", fmtImporte(r.importe)]])}/>`);
      }
      lineas.push(`          </pago20:RetencionesP>`);
    }
    if (agregados.traslados.length) {
      lineas.push(`          <pago20:TrasladosP>`);
      for (const g of agregados.traslados) {
        lineas.push(
          `            <pago20:TrasladoP${attrs([
            ["BaseP", fmtImporte(g.base)],
            ["ImpuestoP", g.impuesto],
            ["TipoFactorP", g.tipoFactor],
            ["TasaOCuotaP", g.tipoFactor === "Exento" ? undefined : g.tasa !== undefined ? fmtTasa(g.tasa) : undefined],
            ["ImporteP", g.tipoFactor === "Exento" ? undefined : fmtImporte(g.importe)],
          ])}/>`,
        );
      }
      lineas.push(`          </pago20:TrasladosP>`);
    }
    lineas.push(`        </pago20:ImpuestosP>`);
  }

  lineas.push(`      </pago20:Pago>`);
  lineas.push(`    </pago20:Pagos>`);
  return lineas.join("\n");
}

/** Partes de la cadena original del complemento (secuencia del XSLT pagos20). */
export function partesPagos(pago: PagoRep, agregados: AgregadosPago): string[] {
  const { partes, req, opc } = nuevoAcumulador();
  const t = agregados.totales;

  req("2.0");
  // Totales
  opc(fmtTotal(t.retencionesIVA));
  opc(fmtTotal(t.retencionesISR));
  opc(fmtTotal(t.retencionesIEPS));
  opc(fmtTotal(t.trasladosBaseIVA16));
  opc(fmtTotal(t.trasladosImpuestoIVA16));
  opc(fmtTotal(t.trasladosBaseIVA8));
  opc(fmtTotal(t.trasladosImpuestoIVA8));
  opc(fmtTotal(t.trasladosBaseIVA0));
  opc(fmtTotal(t.trasladosImpuestoIVA0));
  opc(fmtTotal(t.trasladosBaseIVAExento));
  req(fmtImporte(t.montoTotalPagos));

  // Pago
  req(pago.fechaPago);
  req(pago.formaPago);
  req(pago.moneda);
  opc(pago.moneda === "MXN" ? "1" : undefined);
  req(fmtImporte(pago.monto));

  for (const d of pago.doctos) {
    req(d.uuid);
    opc(d.serie);
    opc(d.folio);
    req(pago.moneda);
    opc("1"); // EquivalenciaDR
    req(String(d.parcialidad));
    req(fmtImporte(d.saldoAnterior));
    req(fmtImporte(d.pagado));
    req(fmtImporte(d.saldoInsoluto));
    req(d.objetoImpDR);
    if (d.objetoImpDR === "02") {
      for (const i of d.impuestos.filter((x) => x.esRetencion)) {
        req(fmtImporte(i.base));
        req(i.impuesto);
        req(i.tipoFactor);
        req(i.tasa !== undefined ? fmtTasa(i.tasa) : "");
        req(fmtImporte(i.importe ?? 0));
      }
      for (const i of d.impuestos.filter((x) => !x.esRetencion)) {
        req(fmtImporte(i.base));
        req(i.impuesto);
        req(i.tipoFactor);
        if (i.tipoFactor !== "Exento") {
          opc(i.tasa !== undefined ? fmtTasa(i.tasa) : undefined);
          opc(fmtTotal(i.importe));
        }
      }
    }
  }

  // ImpuestosP: primero retenciones, luego traslados
  for (const r of agregados.retenciones) {
    req(r.impuesto);
    req(fmtImporte(r.importe));
  }
  for (const g of agregados.traslados) {
    req(fmtImporte(g.base));
    req(g.impuesto);
    req(g.tipoFactor);
    if (g.tipoFactor !== "Exento") {
      opc(g.tasa !== undefined ? fmtTasa(g.tasa) : undefined);
      opc(fmtImporte(g.importe));
    }
  }

  return partes;
}

/** Cadena original completa del REP (comprobante + complemento de pagos). */
export function cadenaOriginalPago(comprobante: ComprobanteCfdi, pago: PagoRep, agregados: AgregadosPago): string {
  const partes = [...partesComprobante(comprobante), ...partesPagos(pago, agregados)];
  return `||${partes.join("|")}||`;
}

/** XML completo del REP: comprobante 4.0 + complemento pago20, listo para sellar. */
export function xmlPagoCompleto(comprobante: ComprobanteCfdi, pago: PagoRep, agregados: AgregadosPago): string {
  let xml = buildCfdiXml(comprobante);
  // El XSD del complemento debe declararse en el nodo raíz
  xml = xml.replace(
    `xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"`,
    `xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"`,
  );
  return insertarComplemento(xml, xmlPagos(pago, agregados));
}
