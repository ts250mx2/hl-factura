import { cargarXmlsCfdi } from "../archivos";
import { XMLParser } from "fast-xml-parser";
import { listarBoveda } from "../repos";
import { round2 } from "../sat/importes";

// DIOT — Declaración Informativa de Operaciones con Terceros.
// Agrupa los CFDI recibidos y efectivamente pagados (PUE) del periodo por
// proveedor, desglosando la base de IVA por tasa (16/8/0/exento), el IVA
// acreditable, el IVA retenido y el IVA no acreditable (gastos no deducibles).
// La DIOT se presenta por flujo, así que solo se consideran los pagados.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

interface Desglose {
  base16: number;
  iva16: number;
  base8: number;
  iva8: number;
  base0: number;
  exento: number;
  ivaRetenido: number;
}

function vacio(): Desglose {
  return { base16: 0, iva16: 0, base8: 0, iva8: 0, base0: 0, exento: 0, ivaRetenido: 0 };
}

function comoArray(x: unknown): Record<string, unknown>[] {
  if (Array.isArray(x)) return x as Record<string, unknown>[];
  if (x && typeof x === "object") return [x as Record<string, unknown>];
  return [];
}

/** Desglosa un XML recibido por tasa de IVA (nivel comprobante). */
function desglosarCfdi(xml: string): Desglose {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const comp = (Array.isArray(doc.Comprobante) ? doc.Comprobante[0] : doc.Comprobante) as Record<string, unknown> | undefined;
  const d = vacio();
  if (!comp) return d;
  const imp = (Array.isArray(comp.Impuestos) ? comp.Impuestos[0] : comp.Impuestos) as Record<string, unknown> | undefined;

  const trasNodo = imp ? (Array.isArray(imp.Traslados) ? imp.Traslados[0] : imp.Traslados) : undefined;
  const traslados = trasNodo ? comoArray((trasNodo as Record<string, unknown>).Traslado) : [];
  for (const t of traslados) {
    if (String(t["@Impuesto"] ?? "") !== "002") continue;
    const base = Number(t["@Base"] ?? 0);
    const importe = Number(t["@Importe"] ?? 0);
    const factor = String(t["@TipoFactor"] ?? "Tasa");
    const tasa = Number(t["@TasaOCuota"] ?? 0);
    if (factor === "Exento") d.exento = round2(d.exento + base);
    else if (Math.abs(tasa - 0.16) < 0.001) { d.base16 = round2(d.base16 + base); d.iva16 = round2(d.iva16 + importe); }
    else if (Math.abs(tasa - 0.08) < 0.001) { d.base8 = round2(d.base8 + base); d.iva8 = round2(d.iva8 + importe); }
    else if (Math.abs(tasa) < 0.001) d.base0 = round2(d.base0 + base);
  }

  const retNodo = imp ? (Array.isArray(imp.Retenciones) ? imp.Retenciones[0] : imp.Retenciones) : undefined;
  const retenciones = retNodo ? comoArray((retNodo as Record<string, unknown>).Retencion) : [];
  for (const r of retenciones) {
    if (String(r["@Impuesto"] ?? "") === "002") d.ivaRetenido = round2(d.ivaRetenido + Number(r["@Importe"] ?? 0));
  }

  // Si no hubo desglose de traslados, tratamos el subtotal como exento (op. no gravada).
  if (d.base16 === 0 && d.base8 === 0 && d.base0 === 0 && d.exento === 0) {
    const sub = Number(comp["@SubTotal"] ?? 0) - Number(comp["@Descuento"] ?? 0);
    if (sub > 0) d.exento = round2(sub);
  }
  return d;
}

export interface RenglonDiot {
  tipoTercero: string; // 04 nacional, 05 extranjero, 15 global
  tipoOperacion: string; // 03 servicios, 06 arrendamiento, 85 otros
  rfc: string;
  nombre: string;
  base16: number;
  iva16: number; // acreditable
  base8: number;
  iva8: number; // acreditable
  base0: number;
  exento: number;
  ivaRetenido: number;
  ivaNoAcreditable: number;
  comprobantes: number;
}

export interface Diot {
  periodo: { anio: string; mes: string };
  renglones: RenglonDiot[];
  totales: Omit<RenglonDiot, "tipoTercero" | "tipoOperacion" | "rfc" | "nombre">;
  sinXml: number; // CFDI sin XML (no se pudo desglosar su IVA)
}

function tipoTerceroDeRfc(rfc: string): string {
  const r = rfc.toUpperCase();
  if (r === "XEXX010101000") return "05"; // extranjero genérico
  if (r === "XAXX010101000") return "15"; // público en general / global
  return r.length === 12 || r.length === 13 ? "04" : "05";
}

export async function calcularDiot(empresaId: string, anio: string, mes: string): Promise<Diot> {
  const enPeriodo = (fecha: string) => fecha.startsWith(`${anio}-${mes}`);
  const recibidas = (await listarBoveda([empresaId], { tipo: "recibida", limite: 2000 })).filter(
    (c) => enPeriodo(c.fecha) && c.estatusSat === "vigente" && (c.tipoComprobante ?? "I") === "I" && c.metodoPago !== "PPD",
  );

  const mapa = new Map<string, RenglonDiot>();
  let sinXml = 0;
  const xmls = await cargarXmlsCfdi(empresaId, recibidas);

  for (const c of recibidas) {
    const xml = xmls.get(c.uuid);
    if (!xml) {
      sinXml++;
      continue;
    }
    let d: Desglose;
    try {
      d = desglosarCfdi(xml);
    } catch {
      sinXml++;
      continue;
    }
    const tipoOperacion = "85"; // Otros (ajustable por el contribuyente en el portal)
    const clave = `${c.emisorRfc}|${tipoOperacion}`;
    const acreditable = c.deducible === "ok";
    const r =
      mapa.get(clave) ??
      {
        tipoTercero: tipoTerceroDeRfc(c.emisorRfc),
        tipoOperacion,
        rfc: c.emisorRfc,
        nombre: c.emisorNombre || c.emisorRfc,
        base16: 0, iva16: 0, base8: 0, iva8: 0, base0: 0, exento: 0, ivaRetenido: 0, ivaNoAcreditable: 0, comprobantes: 0,
      };
    r.base16 = round2(r.base16 + d.base16);
    r.base8 = round2(r.base8 + d.base8);
    r.base0 = round2(r.base0 + d.base0);
    r.exento = round2(r.exento + d.exento);
    r.ivaRetenido = round2(r.ivaRetenido + d.ivaRetenido);
    if (acreditable) {
      r.iva16 = round2(r.iva16 + d.iva16);
      r.iva8 = round2(r.iva8 + d.iva8);
    } else {
      r.ivaNoAcreditable = round2(r.ivaNoAcreditable + d.iva16 + d.iva8);
    }
    r.comprobantes++;
    mapa.set(clave, r);
  }

  const renglones = [...mapa.values()].sort((a, b) => b.base16 + b.base8 - (a.base16 + a.base8));
  const totales = renglones.reduce(
    (t, r) => ({
      base16: round2(t.base16 + r.base16),
      iva16: round2(t.iva16 + r.iva16),
      base8: round2(t.base8 + r.base8),
      iva8: round2(t.iva8 + r.iva8),
      base0: round2(t.base0 + r.base0),
      exento: round2(t.exento + r.exento),
      ivaRetenido: round2(t.ivaRetenido + r.ivaRetenido),
      ivaNoAcreditable: round2(t.ivaNoAcreditable + r.ivaNoAcreditable),
      comprobantes: t.comprobantes + r.comprobantes,
    }),
    { base16: 0, iva16: 0, base8: 0, iva8: 0, base0: 0, exento: 0, ivaRetenido: 0, ivaNoAcreditable: 0, comprobantes: 0 },
  );

  return { periodo: { anio, mes }, renglones, totales, sinXml };
}

const N = (v: number) => Math.round(v).toString(); // la DIOT se presenta en pesos sin decimales

/**
 * Archivo por lotes de la DIOT (campos separados por pipe, un renglón por
 * proveedor). Orden: tipo tercero | tipo operación | RFC | ID fiscal | nombre
 * extranjero | país | nacionalidad | base 16% | base 16% importación |
 * base 8% | base 0% | exentos | IVA retenido | IVA no acreditable.
 */
export function generarTxtDiot(diot: Diot): string {
  return diot.renglones
    .map((r) =>
      [
        r.tipoTercero, r.tipoOperacion, r.rfc, "", "", "", "",
        N(r.base16), "0", N(r.base8), N(r.base0), N(r.exento), N(r.ivaRetenido), N(r.ivaNoAcreditable),
      ].join("|"),
    )
    .join("\r\n");
}

/** CSV de revisión con encabezados legibles. */
export function generarCsvDiot(diot: Diot): string {
  const enc = [
    "Tipo tercero", "Tipo operacion", "RFC", "Proveedor",
    "Base 16%", "IVA 16% acreditable", "Base 8%", "IVA 8% acreditable",
    "Base 0%", "Exento", "IVA retenido", "IVA no acreditable", "Comprobantes",
  ];
  const filas = diot.renglones.map((r) =>
    [
      r.tipoTercero, r.tipoOperacion, r.rfc, `"${r.nombre.replace(/"/g, "'")}"`,
      r.base16, r.iva16, r.base8, r.iva8, r.base0, r.exento, r.ivaRetenido, r.ivaNoAcreditable, r.comprobantes,
    ].join(","),
  );
  const tot = diot.totales;
  filas.push(
    ["", "", "", "TOTALES", tot.base16, tot.iva16, tot.base8, tot.iva8, tot.base0, tot.exento, tot.ivaRetenido, tot.ivaNoAcreditable, tot.comprobantes].join(","),
  );
  return [enc.join(","), ...filas].join("\r\n");
}
