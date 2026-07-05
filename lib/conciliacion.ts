import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "./sql";
import { obtenerCartera, type ItemCartera } from "./cxc";
import { round2 } from "./sat/importes";

// Conciliación bancaria semi-automatizada:
//  1) Parser flexible de estados de cuenta CSV (detecta delimitador, encabezado,
//     columnas de fecha/concepto/abono-cargo o importe único, y formatos de fecha).
//  2) Motor de emparejamiento de DEPÓSITOS contra la cartera PPD: por monto
//     exacto (saldo o total de la factura) y por referencia (folio / cliente).
//  3) Memoria de movimientos ya conciliados (hash) para no duplicar REPs.

/* ================= Parser de estados de cuenta ================= */

export interface MovimientoBanco {
  fecha: string; // YYYY-MM-DD o el texto original si no se pudo interpretar
  referencia: string;
  monto: number; // positivo = depósito
}

function detectarDelimitador(lineas: string[]): string {
  const candidatos = [",", ";", "\t", "|"];
  let mejor = ",";
  let max = 0;
  for (const d of candidatos) {
    const conteo = lineas.slice(0, 8).reduce((s, l) => s + (l.split(d).length - 1), 0);
    if (conteo > max) {
      max = conteo;
      mejor = d;
    }
  }
  return mejor;
}

function partirCsv(linea: string, delim: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else enComillas = false;
      } else actual += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === delim) {
      campos.push(actual);
      actual = "";
    } else actual += ch;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

function parseImporte(v: string): number | null {
  if (!v) return null;
  let s = v.replace(/[$\s]/g, "").replace(/mxn|mn/gi, "");
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  // 1,234.56 (formato MX) — quitar comas de miles
  s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

function parseFecha(v: string): string {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

const RE = {
  fecha: /fecha|date|d[ií]a/i,
  abono: /abono|dep[oó]sito|haber|cr[eé]dito|ingreso/i,
  cargo: /cargo|retiro|debe|d[eé]bito|egreso/i,
  monto: /importe|monto|cantidad|amount/i,
  referencia: /referencia|concepto|descripci[oó]n|detalle|movimiento|beneficiario/i,
};

export interface ResultadoParser {
  depositos: MovimientoBanco[];
  totalLineas: number;
  ignorados: number; // cargos / retiros / líneas sin importe
  advertencia?: string;
}

/** Lee un estado de cuenta CSV/TXT y devuelve solo los depósitos. */
export function parsearEstadoDeCuenta(contenido: string): ResultadoParser {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) throw new Error("El archivo está vacío.");
  const delim = detectarDelimitador(lineas);

  // Encontrar el renglón de encabezados
  let idxHeader = -1;
  let cols: string[] = [];
  for (let i = 0; i < Math.min(lineas.length, 10); i++) {
    const campos = partirCsv(lineas[i], delim);
    const tieneFecha = campos.some((c) => RE.fecha.test(c));
    const tieneImporte = campos.some((c) => RE.abono.test(c) || RE.monto.test(c));
    if (tieneFecha && tieneImporte) {
      idxHeader = i;
      cols = campos.map((c) => c.toLowerCase());
      break;
    }
  }
  if (idxHeader < 0) {
    throw new Error(
      "No se reconoció el encabezado. El archivo debe tener columnas de fecha y de abono/depósito (o importe).",
    );
  }

  const iFecha = cols.findIndex((c) => RE.fecha.test(c));
  const iAbono = cols.findIndex((c) => RE.abono.test(c) && !RE.cargo.test(c));
  const iCargo = cols.findIndex((c) => RE.cargo.test(c));
  const iMonto = cols.findIndex((c) => RE.monto.test(c));
  const iRef = cols.findIndex((c) => RE.referencia.test(c));

  const depositos: MovimientoBanco[] = [];
  let ignorados = 0;

  for (const linea of lineas.slice(idxHeader + 1)) {
    const campos = partirCsv(linea, delim);
    if (campos.length < 2) continue;
    let monto: number | null = null;
    if (iAbono >= 0) {
      monto = parseImporte(campos[iAbono] ?? "");
      if ((monto === null || monto === 0) && iCargo >= 0 && parseImporte(campos[iCargo] ?? "")) {
        ignorados++; // es un cargo/retiro
        continue;
      }
    } else if (iMonto >= 0) {
      monto = parseImporte(campos[iMonto] ?? "");
      if (monto !== null && monto < 0) {
        ignorados++;
        continue;
      }
    }
    if (monto === null || monto <= 0) {
      ignorados++;
      continue;
    }
    depositos.push({
      fecha: parseFecha(campos[iFecha] ?? ""),
      referencia: (iRef >= 0 ? campos[iRef] : campos.filter((_, i) => i !== iFecha).join(" ")).slice(0, 290),
      monto: round2(monto),
    });
  }

  return {
    depositos,
    totalLineas: lineas.length - idxHeader - 1,
    ignorados,
    advertencia:
      iAbono < 0 && iMonto >= 0
        ? "El archivo tiene una sola columna de importe: se asumió que los positivos son depósitos."
        : undefined,
  };
}

/* ================= Motor de emparejamiento ================= */

export interface Candidato {
  facturaId: string;
  folio: string;
  cliente: string;
  clienteId: string;
  saldo: number;
  total: number;
  puntuacion: number;
  razon: string;
}

export type EstadoMatch = "ya_conciliado" | "exacta" | "varias" | "parcial" | "sin_coincidencia";

export interface DepositoAnalizado extends MovimientoBanco {
  hash: string;
  estado: EstadoMatch;
  candidatos: Candidato[];
}

export function hashMovimiento(empresaId: string, m: MovimientoBanco): string {
  return crypto
    .createHash("sha1")
    .update(`${empresaId}|${m.fecha}|${m.monto.toFixed(2)}|${(m.referencia || "").toUpperCase().replace(/\s+/g, " ")}`)
    .digest("hex");
}

function normalizar(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ");
}

function refCoincide(ref: string, item: ItemCartera): boolean {
  const r = normalizar(ref);
  const f = item.factura;
  const folioVariantes = [`${f.serie}${f.folio}`, `${f.serie} ${f.folio}`, `${f.serie}-${f.folio}`.replace("-", " ")];
  if (folioVariantes.some((v) => r.includes(normalizar(v)))) return true;
  // palabras significativas del nombre del cliente (≥4 letras)
  const palabras = normalizar(f.receptorNombre).split(/\s+/).filter((p) => p.length >= 4);
  const aciertos = palabras.filter((p) => r.includes(p)).length;
  return palabras.length > 0 && aciertos >= Math.min(2, palabras.length);
}

export async function analizarDepositos(
  empresaId: string,
  depositos: MovimientoBanco[],
): Promise<DepositoAnalizado[]> {
  const { items } = await obtenerCartera([empresaId]);
  const pool = await db();
  const hashes = depositos.map((m) => hashMovimiento(empresaId, m));
  const [previas] = await pool.query<RowDataPacket[]>(
    "SELECT hash FROM conciliaciones WHERE empresaId = ? AND hash IN (?)",
    [empresaId, hashes.length ? hashes : [""]],
  );
  const yaConciliados = new Set(previas.map((p) => String(p.hash)));

  return depositos.map((m, i) => {
    const hash = hashes[i];
    if (yaConciliados.has(hash)) {
      return { ...m, hash, estado: "ya_conciliado" as const, candidatos: [] };
    }

    const candidatos: Candidato[] = [];
    for (const item of items) {
      const f = item.factura;
      let puntuacion = 0;
      let razon = "";
      if (Math.abs(item.saldo - m.monto) <= 0.01) {
        puntuacion = 100;
        razon = "monto igual al saldo";
      } else if (Math.abs(f.total - m.monto) <= 0.01) {
        puntuacion = 90;
        razon = "monto igual al total de la factura";
      } else if (m.monto < item.saldo - 0.01 && refCoincide(m.referencia, item)) {
        puntuacion = 60;
        razon = "referencia coincide (posible pago parcial)";
      }
      if (puntuacion > 0 && refCoincide(m.referencia, item)) {
        puntuacion += 10;
        razon += " + referencia";
      }
      if (puntuacion > 0) {
        candidatos.push({
          facturaId: f.id,
          folio: `${f.serie}-${f.folio}`,
          cliente: f.receptorNombre,
          clienteId: f.clienteId,
          saldo: item.saldo,
          total: f.total,
          puntuacion,
          razon,
        });
      }
    }
    candidatos.sort((a, b) => b.puntuacion - a.puntuacion);

    let estado: EstadoMatch = "sin_coincidencia";
    const fuertes = candidatos.filter((c) => c.puntuacion >= 90);
    if (fuertes.length === 1) estado = "exacta";
    else if (fuertes.length > 1) estado = "varias";
    else if (candidatos.length > 0) estado = "parcial";

    return { ...m, hash, estado, candidatos: candidatos.slice(0, 5) };
  });
}

/* ================= Registro de conciliaciones ================= */

export interface ConciliacionAplicada {
  id: string;
  fecha: string;
  referencia: string;
  monto: number;
  facturaId: string;
  pagoRepId: string;
  creadoEl: string;
}

export async function registrarConciliacion(
  empresaId: string,
  mov: MovimientoBanco,
  facturaId: string,
  pagoRepId: string,
): Promise<void> {
  const pool = await db();
  await pool.query(
    `INSERT INTO conciliaciones (id, empresaId, hash, fecha, referencia, monto, facturaId, pagoRepId, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(), empresaId, hashMovimiento(empresaId, mov), mov.fecha,
      mov.referencia.slice(0, 290), mov.monto, facturaId, pagoRepId, new Date().toISOString(),
    ],
  );
}

export async function historialConciliaciones(empresaId: string, limite = 100): Promise<ConciliacionAplicada[]> {
  const pool = await db();
  const [r] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM conciliaciones WHERE empresaId = ? ORDER BY creadoEl DESC LIMIT ?",
    [empresaId, limite],
  );
  return r.map((x) => ({
    id: String(x.id),
    fecha: String(x.fecha),
    referencia: String(x.referencia ?? ""),
    monto: Number(x.monto),
    facturaId: String(x.facturaId),
    pagoRepId: String(x.pagoRepId),
    creadoEl: String(x.creadoEl),
  }));
}
