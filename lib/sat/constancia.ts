import pdf from "pdf-parse/lib/pdf-parse.js";
import type { ObligacionFiscal, PerfilFiscal, RegimenRegistrado } from "../types";
import { claveRegimenPorNombre, clasificarObligacion, normalizar, regimenPorClave } from "../contabilidad/obligaciones";

// Lectura de la Constancia de Situación Fiscal (PDF del SAT): extrae el RFC,
// la situación en el padrón, los regímenes y las obligaciones registradas.
// Es de mejor esfuerzo: el layout del PDF varía, así que lo que no se detecte
// puede corregirse manualmente en la interfaz.

export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return String(data.text || "");
}

/** Normaliza una fecha (dd/mm/aaaa, aaaa-mm-dd o "DD DE MES DE AAAA") a ISO. */
function fechaIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const MESES: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
    julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  };
  m = normalizar(s).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (m && MESES[m[2]]) return `${m[3]}-${MESES[m[2]]}-${m[1].padStart(2, "0")}`;
  return undefined;
}

const RE_FECHA = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/g;

export function parsearTextoConstancia(texto: string): PerfilFiscal {
  // NFC: algunos PDF traen los acentos descompuestos (o + ´) y rompen las regex.
  const plano = texto.normalize("NFC").replace(/\r/g, "");
  const lineas = plano.split("\n").map((l) => l.trim()).filter(Boolean);
  const perfil: PerfilFiscal = { regimenes: [], obligaciones: [], fuente: "csf" };

  const rfc = plano.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
  if (rfc) {
    perfil.rfc = rfc[1].toUpperCase();
    perfil.tipoPersona = perfil.rfc.length === 12 ? "moral" : "fisica";
  }
  const curp = plano.match(/\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/);
  if (curp) perfil.curp = curp[1].toUpperCase();
  // Código postal: se busca en texto normalizado (minúsculas, sin acentos)
  // porque el extractor a veces pierde el espacio entre celdas de la tabla
  // ("CódigoPostal:67160"). Si la etiqueta no aparece pegada al valor, se toma
  // el primer número de 5 dígitos cercano a "domicilio".
  const planoNorm = normalizar(plano);
  const cp = planoNorm.match(/codigo\s?postal\s*:?\s*(\d{5})(?!\d)/) ?? planoNorm.match(/domicilio[\s\S]{0,250}?\b(\d{5})(?!\d)/);
  if (cp) perfil.codigoPostal = cp[1];
  const estatus = plano.match(/[Ee]status[^:\n]*:\s*([A-Za-zÁÉÍÓÚÑñáéíóú ]+)/);
  if (estatus) perfil.situacion = estatus[1].trim().toUpperCase().split(/\s{2,}/)[0];
  const inicio = plano.match(/fecha\s+(?:de\s+)?inicio\s+de\s+operaciones\s*:?\s*(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (inicio) perfil.fechaInicioOperaciones = fechaIso(inicio[1]);

  // Nombre / razón social. Ojo: el recuadro de la cédula trae el rótulo
  // "Nombre, denominación o razón social" DESPUÉS del valor, así que buscar
  // "Nombre" a secas captura ese rótulo (", denominación o razón") y no el dato.
  const recortaEtiquetas = (s: string) =>
    s.split(/\s*(?:R[eé]gimen\s+Capital|Nombre\s+Comercial|Primer\s+Apellido|Segundo\s+Apellido|Fecha\s+(?:de\s+)?inicio|CURP|Estatus)\s*:?/i)[0];
  const limpiaNombre = (s: string) =>
    recortaEtiquetas(s).replace(/\s{2,}/g, " ").replace(/^[,:.\s]+/, "").trim().slice(0, 200);

  // Los dos puntos son obligatorios: distinguen la etiqueta de la sección de
  // datos ("Denominación/Razón Social: X") del rótulo del QR, que no los lleva.
  let nombre = "";
  const nomMoral = plano.match(/Denominaci[oó]n\s*\/?\s*(?:o\s+)?Raz[oó]n\s+Social\s*:\s*([^\n]+)/i);
  if (nomMoral) nombre = limpiaNombre(nomMoral[1]);
  if (!nombre) {
    // Persona física: nombre y apellidos vienen en campos separados.
    const nomFisica = plano.match(/Nombre\s*\(\s*s\s*\)\s*:\s*([^\n]+)/i);
    if (nomFisica) {
      const ap1 = plano.match(/Primer\s+Apellido\s*:\s*([^\n]+)/i);
      const ap2 = plano.match(/Segundo\s+Apellido\s*:\s*([^\n]+)/i);
      nombre = [nomFisica[1], ap1?.[1], ap2?.[1]]
        .map((s) => limpiaNombre(s ?? ""))
        .filter(Boolean)
        .join(" ");
    }
  }
  if (!nombre) {
    // Último recurso: en el recuadro de la cédula el nombre viene entre
    // "Registro Federal de Contribuyentes" y el rótulo "Nombre, denominación...".
    const iRfc = lineas.findIndex((l) => /registro federal de contribuyentes/.test(normalizar(l)));
    const iRot = lineas.findIndex((l, i) => i > iRfc && /^nombre[\s,]/.test(normalizar(l)));
    if (iRfc >= 0 && iRot > iRfc + 1) {
      const entre = lineas
        .slice(iRfc + 1, iRot)
        .filter((l) => !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(l) && !/idcif/.test(normalizar(l)));
      nombre = limpiaNombre(entre.join(" "));
    }
  }
  if (nombre) perfil.nombre = nombre;

  // Secciones: localizar encabezados de "Regímenes" y "Obligaciones"
  const idxReg = lineas.findIndex((l) => /^reg[ií]men(es)?\b/i.test(l) || /reg[ií]menes\b/i.test(normalizar(l)));
  const idxObl = lineas.findIndex((l) => /^obligaci[oó]n(es)?\b/i.test(l) || /obligaciones\b/i.test(normalizar(l)));

  const parseFilas = (desde: number, hasta: number) => {
    const filas: { texto: string; fechas: string[] }[] = [];
    for (let i = desde; i < hasta && i < lineas.length; i++) {
      const l = lineas[i];
      const fechas = l.match(RE_FECHA) ?? [];
      const nombre = l.replace(RE_FECHA, "").replace(/\s{2,}/g, " ").trim();
      if (!nombre || nombre.length < 5) continue;
      if (/descripci[oó]n|fecha\s+(de\s+)?inicio|fecha\s+(de\s+)?fin|vencimiento/i.test(normalizar(nombre))) continue;
      filas.push({ texto: nombre, fechas });
    }
    return filas;
  };

  if (idxReg >= 0) {
    const fin = idxObl > idxReg ? idxObl : lineas.length;
    for (const f of parseFilas(idxReg + 1, fin)) {
      const clave = claveRegimenPorNombre(f.texto);
      if (!clave) continue;
      const reg: RegimenRegistrado = {
        clave,
        nombre: regimenPorClave(clave)?.nombre ?? f.texto,
        fechaInicio: fechaIso(f.fechas[0]),
        fechaFin: fechaIso(f.fechas[1]),
      };
      if (!perfil.regimenes.some((r) => r.clave === reg.clave)) perfil.regimenes.push(reg);
    }
  }

  if (idxObl >= 0) {
    for (const f of parseFilas(idxObl + 1, lineas.length)) {
      // corta descripciones absurdamente largas (ruido del pie de página)
      const desc = f.texto.slice(0, 160);
      if (/http|sat\.gob|cadena original|sello digital|folio|p[aá]gina/i.test(normalizar(desc))) continue;
      const obl: ObligacionFiscal = {
        descripcion: desc,
        tipo: clasificarObligacion(desc),
        fechaInicio: fechaIso(f.fechas[0]),
        fechaFin: fechaIso(f.fechas[1]),
      };
      perfil.obligaciones.push(obl);
    }
  }

  return perfil;
}

export async function parsearConstancia(buffer: Buffer): Promise<PerfilFiscal> {
  const texto = await extraerTextoPdf(buffer);
  return parsearTextoConstancia(texto);
}
