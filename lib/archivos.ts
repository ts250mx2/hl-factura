import fs from "fs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "./sql";

// Almacenamiento de archivos (XML, PDF, ZIP) en la base de datos, para no
// depender de archivos físicos y poder trabajar en local y en producción con
// los mismos datos. Claves lógicas (id):
//   csf:<empresaId>                CSF (PDF)
//   opinion:<empresaId>            Opinión de Cumplimiento 32-D (PDF)
//   cfdi:<empresaId>:<uuid>        CFDI descargado (XML)
//   emitido:<factura|pago|recibo>:<id>   CFDI emitido (XML)
//   paquete:<packageId>           paquete de descarga masiva (ZIP)

export const idCsf = (empresaId: string) => `csf:${empresaId}`;
export const idOpinion = (empresaId: string) => `opinion:${empresaId}`;
export const idCfdi = (empresaId: string, uuid: string) => `cfdi:${empresaId}:${uuid}`;
export const idEmitido = (tipo: "factura" | "pago" | "recibo", id: string) => `emitido:${tipo}:${id}`;
export const idPaquete = (packageId: string) => `paquete:${packageId}`;

function aBuffer(c: unknown): Buffer {
  return Buffer.isBuffer(c) ? c : Buffer.from(String(c), "binary");
}

export async function guardarArchivo(
  id: string,
  categoria: string,
  mime: string,
  nombre: string | null,
  contenido: Buffer,
  empresaId?: string | null,
): Promise<void> {
  const pool = await db();
  await pool.query(
    `INSERT INTO archivos (id, empresaId, categoria, mime, nombre, contenido, bytes, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE contenido = VALUES(contenido), mime = VALUES(mime),
       nombre = VALUES(nombre), bytes = VALUES(bytes), creadoEl = VALUES(creadoEl)`,
    [id, empresaId ?? null, categoria, mime, nombre, contenido, contenido.length, new Date().toISOString()],
  );
}

export async function leerArchivo(id: string): Promise<Buffer | null> {
  const pool = await db();
  const [rows] = await pool.query<RowDataPacket[]>("SELECT contenido FROM archivos WHERE id = ?", [id]);
  return rows[0] ? aBuffer(rows[0].contenido) : null;
}

export async function eliminarArchivo(id: string): Promise<void> {
  const pool = await db();
  await pool.query("DELETE FROM archivos WHERE id = ?", [id]);
}

/** IDs de empresa (de las dadas) que tienen un archivo de la categoría indicada.
 *  Sirve para marcar en una lista qué empresas ya tienen su CSF guardada. */
export async function empresasConArchivo(categoria: string, empresaIds: string[]): Promise<Set<string>> {
  if (!empresaIds.length) return new Set();
  const pool = await db();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT empresaId FROM archivos WHERE categoria = ? AND empresaId IN (${empresaIds.map(() => "?").join(",")})`,
    [categoria, ...empresaIds],
  );
  return new Set(rows.map((r) => String(r.empresaId)));
}

/** Texto (XML) desde la BD, con respaldo a disco para datos previos a la migración. */
export async function leerXml(id: string, rutaFallback?: string | null): Promise<string | null> {
  const buf = await leerArchivo(id);
  if (buf) return buf.toString("utf8");
  if (rutaFallback && fs.existsSync(rutaFallback)) {
    try {
      return fs.readFileSync(rutaFallback, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

/** Binario (PDF/ZIP) desde la BD, con respaldo a disco para datos previos. */
export async function leerBinario(id: string, rutaFallback?: string | null): Promise<Buffer | null> {
  const buf = await leerArchivo(id);
  if (buf) return buf;
  if (rutaFallback && fs.existsSync(rutaFallback)) {
    try {
      return fs.readFileSync(rutaFallback);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Carga en una sola consulta los XML de varios CFDI de la bóveda (evita N
 * viajes a la base de datos remota). Para registros aún no migrados, cae al
 * respaldo en disco por su xmlPath.
 */
export async function cargarXmlsCfdi(
  empresaId: string,
  cfdis: { uuid: string; xmlPath?: string }[],
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (!cfdis.length) return resultado;
  const pool = await db();
  const ids = cfdis.map((c) => idCfdi(empresaId, c.uuid));
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, contenido FROM archivos WHERE id IN (${lote.map(() => "?").join(",")})`,
      lote,
    );
    for (const r of rows) {
      const sid = String(r.id);
      const uuid = sid.slice(sid.lastIndexOf(":") + 1);
      resultado.set(uuid, aBuffer(r.contenido).toString("utf8"));
    }
  }
  // Respaldo a disco para CFDI aún no migrados (instalaciones previas).
  for (const c of cfdis) {
    if (resultado.has(c.uuid) || !c.xmlPath) continue;
    if (fs.existsSync(c.xmlPath)) {
      try {
        resultado.set(c.uuid, fs.readFileSync(c.xmlPath, "utf8"));
      } catch {
        /* ignore */
      }
    }
  }
  return resultado;
}
