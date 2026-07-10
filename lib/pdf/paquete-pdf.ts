import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Emisor } from "../types";
import type { PaqueteMensual } from "../contabilidad/paquete";
import { mxn } from "../sat/format-server";

// Genera el reporte mensual del cliente como PDF (pdf-lib, sin dependencias
// nativas). Layout con cursor vertical, ajuste de línea y salto de página.

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const PAGE = { w: 612, h: 792 };
const MARGIN = 48;
const CONTENT_W = PAGE.w - MARGIN * 2;

const INK = rgb(0.12, 0.15, 0.2);
const MUTED = rgb(0.45, 0.5, 0.56);
const LINE = rgb(0.85, 0.87, 0.9);
const BRAND = rgb(0.31, 0.27, 0.9);
const ROSE = rgb(0.86, 0.15, 0.28);
const GREEN = rgb(0.02, 0.5, 0.33);

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function nuevaPagina(c: Ctx) {
  c.page = c.doc.addPage([PAGE.w, PAGE.h]);
  c.y = PAGE.h - MARGIN;
}
function asegurar(c: Ctx, alto: number) {
  if (c.y - alto < MARGIN) nuevaPagina(c);
}
function texto(c: Ctx, s: string, opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; alignRight?: number } = {}) {
  const size = opts.size ?? 10;
  const fuente = opts.bold ? c.bold : c.font;
  let x = opts.x ?? MARGIN;
  if (opts.alignRight !== undefined) x = opts.alignRight - fuente.widthOfTextAtSize(s, size);
  c.page.drawText(s, { x, y: c.y, size, font: fuente, color: opts.color ?? INK });
}
function linea(c: Ctx) {
  c.page.drawLine({ start: { x: MARGIN, y: c.y }, end: { x: PAGE.w - MARGIN, y: c.y }, thickness: 0.5, color: LINE });
}
/** Divide un texto largo en líneas que caben en el ancho dado. Una palabra más
 *  ancha que la línea (p. ej. un UUID) se parte por caracteres para no desbordar. */
function envolver(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  let actual = "";
  for (const p of s.split(/\s+/)) {
    if (font.widthOfTextAtSize(p, size) > maxW) {
      if (actual) { out.push(actual); actual = ""; }
      let trozo = "";
      for (const ch of p) {
        if (trozo && font.widthOfTextAtSize(trozo + ch, size) > maxW) { out.push(trozo); trozo = ch; }
        else trozo += ch;
      }
      actual = trozo;
      continue;
    }
    const prueba = actual ? `${actual} ${p}` : p;
    if (font.widthOfTextAtSize(prueba, size) > maxW && actual) { out.push(actual); actual = p; }
    else actual = prueba;
  }
  if (actual) out.push(actual);
  return out;
}
/** Reduce el tamaño de fuente hasta que el texto quepa en el ancho dado. */
function ajustar(s: string, font: PDFFont, sizeMax: number, sizeMin: number, maxW: number): number {
  let size = sizeMax;
  while (size > sizeMin && font.widthOfTextAtSize(s, size) > maxW) size -= 0.5;
  return size;
}
const money = (n: number) => mxn(n);

function encabezadoSeccion(c: Ctx, titulo: string) {
  asegurar(c, 34);
  c.y -= 18;
  texto(c, titulo.toUpperCase(), { bold: true, size: 11 });
  c.y -= 6;
  linea(c);
  c.y -= 4;
}
function fila(c: Ctx, label: string, valor: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}) {
  asegurar(c, 16);
  c.y -= 14;
  texto(c, label, { x: MARGIN + (opts.indent ?? 0), size: 10, bold: opts.bold, color: opts.indent ? MUTED : INK });
  texto(c, valor, { alignRight: PAGE.w - MARGIN, size: 10, bold: opts.bold, color: opts.color ?? INK });
}

export async function generarPaquetePdf(
  data: PaqueteMensual,
  empresa: Emisor,
  despachoNombre: string | undefined,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c: Ctx = { doc, page: doc.addPage([PAGE.w, PAGE.h]), y: PAGE.h - MARGIN, font, bold };
  const mesNombre = MESES[Number(data.mes) - 1] ?? data.mes;

  // Membrete. El nombre se auto-ajusta para no encimar el título de la derecha
  // ni desbordar; el del despacho también se recorta al ancho disponible.
  c.page.drawRectangle({ x: 0, y: PAGE.h - 92, width: PAGE.w, height: 92, color: BRAND });
  const nombreSize = ajustar(empresa.nombre, bold, 18, 8, CONTENT_W - 150);
  c.page.drawText(empresa.nombre, { x: MARGIN, y: PAGE.h - 44, size: nombreSize, font: bold, color: rgb(1, 1, 1), maxWidth: CONTENT_W - 150 });
  c.page.drawText(`RFC ${empresa.rfc}`, { x: MARGIN, y: PAGE.h - 62, size: 10, font, color: rgb(0.9, 0.9, 1) });
  if (despachoNombre) {
    const dsp = `Preparado por ${despachoNombre}`;
    c.page.drawText(dsp, { x: MARGIN, y: PAGE.h - 78, size: ajustar(dsp, font, 9, 7, CONTENT_W), font, color: rgb(0.85, 0.85, 1) });
  }
  const titulo = `Reporte mensual · ${mesNombre} ${data.anio}`;
  c.page.drawText(titulo, { x: PAGE.w - MARGIN - bold.widthOfTextAtSize(titulo, 11), y: PAGE.h - 44, size: 11, font: bold, color: rgb(1, 1, 1) });
  c.y = PAGE.h - 92 - 6;

  // Resumen ejecutivo
  encabezadoSeccion(c, "Resumen ejecutivo");
  fila(c, "Utilidad del periodo", data.resultados ? money(data.resultados.utilidadNeta) : "—");
  fila(c, "Impuestos a pagar", data.fiscal ? money(data.fiscal.total) : "—", { color: data.fiscal && data.fiscal.total > 0 ? ROSE : INK, bold: true });
  fila(c, "Cartera por cobrar", data.cartera ? money(data.cartera.total) : "—");
  fila(c, "Cartera vencida", data.cartera ? money(data.cartera.vencida) : "—", { color: data.cartera && data.cartera.vencida > 0 ? ROSE : INK });

  // Impuestos determinados
  if (data.fiscal) {
    encabezadoSeccion(c, "Impuestos determinados del mes");
    if (!data.fiscal.perfilConfigurado) {
      const aviso = envolver("Perfil fiscal no configurado; el cálculo es aproximado. Importa la Constancia de Situación Fiscal para mayor precisión.", font, 8, CONTENT_W);
      asegurar(c, aviso.length * 10 + 2);
      c.y -= 12;
      for (const l of aviso) {
        texto(c, l, { size: 8, color: MUTED });
        c.y -= 10;
      }
    }
    for (const cpt of data.fiscal.conceptos) {
      fila(c, cpt.titulo, money(cpt.aCargo), { color: cpt.aCargo > 0 ? ROSE : GREEN });
    }
    c.y -= 6;
    linea(c);
    fila(c, `Total a pagar (vence el 17 de ${MESES[Number(data.mes) % 12]})`, money(data.fiscal.total), { bold: true });
  }

  // Estado de resultados
  if (data.resultados) {
    const r = data.resultados;
    encabezadoSeccion(c, "Estado de resultados (acumulado)");
    fila(c, "Ingresos", money(r.ingresos));
    fila(c, "Costos", money(r.costos));
    fila(c, "Utilidad bruta", money(r.utilidadBruta), { bold: true });
    fila(c, "Gastos de operación", money(r.gastos));
    fila(c, "Utilidad de operación", money(r.utilidadOperacion), { bold: true });
    c.y -= 4;
    linea(c);
    fila(c, "Utilidad antes de impuestos", money(r.utilidadNeta), { bold: true });
  }

  // Revisión de consistencia (amarre)
  if (data.amarre) {
    encabezadoSeccion(c, "Revisión de consistencia fiscal");
    for (const h of data.amarre.hallazgos) {
      const lineas = envolver(`•  ${h}`, font, 9, CONTENT_W);
      asegurar(c, lineas.length * 12 + 4);
      for (const l of lineas) {
        c.y -= 12;
        texto(c, l, { size: 9, color: INK });
      }
    }
  }

  // Pie
  const pie = envolver("Documento informativo preparado por tu despacho a partir de tus CFDI y contabilidad del periodo. Los importes fiscales se determinan con base en flujo de efectivo; no sustituye las declaraciones oficiales ante el SAT.", font, 7.5, CONTENT_W);
  asegurar(c, 34 + pie.length * 9);
  c.y -= 24;
  linea(c);
  c.y -= 10;
  for (const l of pie) {
    texto(c, l, { size: 7.5, color: MUTED });
    c.y -= 9;
  }

  return doc.save();
}
