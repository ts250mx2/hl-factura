import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../sql";
import type { ActivoFijo, ConfigFiscal, CuentaContable, Poliza, ReglaContable } from "../types";
import { CATALOGO_SEMILLA } from "./catalogo";

type Row = RowDataPacket;

async function rows(sql: string, params: unknown[] = []): Promise<Row[]> {
  const pool = await db();
  const [r] = await pool.query<Row[]>(sql, params);
  return r;
}

async function run(sql: string, params: unknown[] = []): Promise<number> {
  const pool = await db();
  const [r] = await pool.query(sql, params);
  return (r as { affectedRows?: number }).affectedRows ?? 0;
}

/* ---------- Catálogo de cuentas ---------- */

export async function listarCuentas(empresaId: string): Promise<CuentaContable[]> {
  const r = await rows("SELECT * FROM cuentas WHERE empresaId = ? ORDER BY codigo", [empresaId]);
  return r.map((x) => ({
    empresaId: String(x.empresaId),
    codigo: String(x.codigo),
    nombre: String(x.nombre),
    codigoAgrupador: String(x.codigoAgrupador),
    naturaleza: x.naturaleza as "D" | "A",
    nivel: Number(x.nivel),
  }));
}

export async function guardarCuenta(c: CuentaContable): Promise<void> {
  await run(
    `INSERT INTO cuentas (empresaId, codigo, nombre, codigoAgrupador, naturaleza, nivel)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), codigoAgrupador = VALUES(codigoAgrupador),
       naturaleza = VALUES(naturaleza), nivel = VALUES(nivel)`,
    [c.empresaId, c.codigo, c.nombre, c.codigoAgrupador, c.naturaleza, c.nivel],
  );
}

export async function eliminarCuenta(empresaId: string, codigo: string): Promise<void> {
  await run("DELETE FROM cuentas WHERE empresaId = ? AND codigo = ?", [empresaId, codigo]);
}

/** Crea el catálogo inicial si la empresa aún no tiene cuentas. */
export async function sembrarCatalogo(empresaId: string): Promise<CuentaContable[]> {
  const existentes = await listarCuentas(empresaId);
  if (existentes.length > 0) return existentes;
  for (const c of CATALOGO_SEMILLA) {
    await guardarCuenta({ ...c, empresaId });
  }
  return listarCuentas(empresaId);
}

/* ---------- Pólizas ---------- */

function mapPoliza(r: Row): Poliza {
  return {
    id: String(r.id),
    empresaId: String(r.empresaId),
    tipo: r.tipo as Poliza["tipo"],
    numero: Number(r.numero),
    fecha: String(r.fecha),
    mes: String(r.mes),
    anio: String(r.anio),
    concepto: String(r.concepto),
    origenTipo: r.origenTipo as Poliza["origenTipo"],
    origenId: String(r.origenId),
    movimientos: JSON.parse(String(r.movimientosJson)),
    total: Number(r.total),
    creadoEl: String(r.creadoEl),
  };
}

/** Inserta la póliza; devuelve false si ya existía una para el mismo origen. */
export async function insertarPoliza(p: Omit<Poliza, "id" | "numero" | "creadoEl">): Promise<boolean> {
  const num = await rows(
    "SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM polizas WHERE empresaId = ? AND tipo = ? AND anio = ? AND mes = ?",
    [p.empresaId, p.tipo, p.anio, p.mes],
  );
  const afectadas = await run(
    `INSERT IGNORE INTO polizas (id, empresaId, tipo, numero, fecha, mes, anio, concepto, origenTipo, origenId, movimientosJson, total, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(), p.empresaId, p.tipo, Number(num[0].n), p.fecha, p.mes, p.anio,
      p.concepto.slice(0, 490), p.origenTipo, p.origenId, JSON.stringify(p.movimientos), p.total,
      new Date().toISOString(),
    ],
  );
  return afectadas > 0;
}

export async function listarPolizas(empresaId: string, anio: string, mes: string): Promise<Poliza[]> {
  const r = await rows(
    "SELECT * FROM polizas WHERE empresaId = ? AND anio = ? AND mes = ? ORDER BY tipo, numero",
    [empresaId, anio, mes],
  );
  return r.map(mapPoliza);
}

export async function getPoliza(empresaId: string, id: string): Promise<Poliza | null> {
  const r = await rows("SELECT * FROM polizas WHERE empresaId = ? AND id = ?", [empresaId, id]);
  return r[0] ? mapPoliza(r[0]) : null;
}

export async function polizasHasta(empresaId: string, anio: string, mes: string): Promise<Poliza[]> {
  // Todas las pólizas ANTERIORES al periodo (para el saldo inicial de la balanza)
  const r = await rows(
    "SELECT * FROM polizas WHERE empresaId = ? AND CONCAT(anio, mes) < CONCAT(?, ?)",
    [empresaId, anio, mes],
  );
  return r.map(mapPoliza);
}

export async function eliminarPoliza(empresaId: string, id: string): Promise<void> {
  await run("DELETE FROM polizas WHERE id = ? AND empresaId = ?", [id, empresaId]);
}

export async function eliminarPolizasPeriodo(empresaId: string, anio: string, mes: string): Promise<number> {
  return run("DELETE FROM polizas WHERE empresaId = ? AND anio = ? AND mes = ? AND origenTipo <> 'manual'", [
    empresaId, anio, mes,
  ]);
}

/* ---------- Reglas contables ---------- */

export async function listarReglas(empresaId: string): Promise<ReglaContable[]> {
  const r = await rows("SELECT * FROM reglas_contables WHERE empresaId = ? ORDER BY criterio, valor", [empresaId]);
  return r.map((x) => ({
    id: String(x.id),
    empresaId: String(x.empresaId),
    criterio: x.criterio as ReglaContable["criterio"],
    valor: String(x.valor),
    cuentaCodigo: String(x.cuentaCodigo),
    nota: x.nota ? String(x.nota) : undefined,
    creadoEl: String(x.creadoEl),
  }));
}

export async function guardarRegla(regla: Omit<ReglaContable, "id" | "creadoEl">): Promise<void> {
  await run(
    "INSERT INTO reglas_contables (id, empresaId, criterio, valor, cuentaCodigo, nota, creadoEl) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [crypto.randomUUID(), regla.empresaId, regla.criterio, regla.valor, regla.cuentaCodigo, regla.nota ?? null, new Date().toISOString()],
  );
}

export async function eliminarRegla(empresaId: string, id: string): Promise<void> {
  await run("DELETE FROM reglas_contables WHERE id = ? AND empresaId = ?", [id, empresaId]);
}

/* ---------- Activos fijos ---------- */

export async function listarActivos(empresaId: string): Promise<ActivoFijo[]> {
  const r = await rows("SELECT * FROM activos_fijos WHERE empresaId = ? ORDER BY fechaAdquisicion", [empresaId]);
  return r.map((x) => ({
    id: String(x.id),
    empresaId: String(x.empresaId),
    descripcion: String(x.descripcion),
    moi: Number(x.moi),
    fechaAdquisicion: String(x.fechaAdquisicion),
    tasaAnual: Number(x.tasaAnual),
    creadoEl: String(x.creadoEl),
  }));
}

export async function guardarActivo(a: Omit<ActivoFijo, "id" | "creadoEl">): Promise<void> {
  await run(
    "INSERT INTO activos_fijos (id, empresaId, descripcion, moi, fechaAdquisicion, tasaAnual, creadoEl) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [crypto.randomUUID(), a.empresaId, a.descripcion, a.moi, a.fechaAdquisicion, a.tasaAnual, new Date().toISOString()],
  );
}

export async function eliminarActivo(empresaId: string, id: string): Promise<void> {
  await run("DELETE FROM activos_fijos WHERE id = ? AND empresaId = ?", [id, empresaId]);
}

/* ---------- Configuración fiscal por empresa ---------- */

const FISCAL_DEFAULT: ConfigFiscal = { regimenCalculo: "auto", coeficienteUtilidad: 0 };

export async function getConfigFiscal(empresaId: string): Promise<ConfigFiscal> {
  const r = await rows("SELECT datosJson FROM config_fiscal WHERE empresaId = ?", [empresaId]);
  return r[0] ? { ...FISCAL_DEFAULT, ...JSON.parse(String(r[0].datosJson)) } : { ...FISCAL_DEFAULT };
}

export async function guardarConfigFiscal(empresaId: string, cfg: ConfigFiscal): Promise<void> {
  await run(
    `INSERT INTO config_fiscal (empresaId, datosJson) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE datosJson = VALUES(datosJson)`,
    [empresaId, JSON.stringify(cfg)],
  );
}

/* ---------- Calendario de obligaciones (marcas de "presentado") ---------- */

/** Obligaciones marcadas como presentadas para varias empresas en un periodo
 *  (AAAA-MM). Devuelve un mapa `${empresaId}|${clave}` → { presentadoEl, nota }. */
export async function obligacionesPresentadas(
  empresaIds: string[],
  periodo: string,
): Promise<Map<string, { presentadoEl: string; nota?: string }>> {
  const mapa = new Map<string, { presentadoEl: string; nota?: string }>();
  if (!empresaIds.length) return mapa;
  const r = await rows(
    "SELECT empresaId, clave, presentadoEl, nota FROM obligaciones_estado WHERE empresaId IN (?) AND periodo = ?",
    [empresaIds, periodo],
  );
  for (const x of r) {
    mapa.set(`${x.empresaId}|${x.clave}`, {
      presentadoEl: String(x.presentadoEl),
      nota: x.nota ? String(x.nota) : undefined,
    });
  }
  return mapa;
}

export async function marcarObligacion(
  empresaId: string,
  clave: string,
  periodo: string,
  presentadoEl: string,
  nota?: string,
): Promise<void> {
  await run(
    `INSERT INTO obligaciones_estado (empresaId, clave, periodo, presentadoEl, nota) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE presentadoEl = VALUES(presentadoEl), nota = VALUES(nota)`,
    [empresaId, clave, periodo, presentadoEl, nota ?? null],
  );
}

export async function desmarcarObligacion(empresaId: string, clave: string, periodo: string): Promise<void> {
  await run("DELETE FROM obligaciones_estado WHERE empresaId = ? AND clave = ? AND periodo = ?", [
    empresaId,
    clave,
    periodo,
  ]);
}
