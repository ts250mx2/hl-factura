import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "../sql";
import type { ConfigNomina, Empleado, ReciboNomina } from "./tipos";
import { PARAMETROS_DEFAULT } from "./catalogos";

type Row = RowDataPacket;

async function rows(sql: string, params: unknown[] = []): Promise<Row[]> {
  const pool = await db();
  const [r] = await pool.query<Row[]>(sql, params);
  return r;
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  const pool = await db();
  await pool.query(sql, params);
}

/* ---------- Empleados ---------- */

export async function listarEmpleados(empresaId: string, soloActivos = false): Promise<Empleado[]> {
  const r = await rows(
    `SELECT datosJson FROM empleados WHERE empresaId = ?${soloActivos ? " AND activo = 1" : ""} ORDER BY nombre`,
    [empresaId],
  );
  return r.map((x) => JSON.parse(String(x.datosJson)));
}

export async function getEmpleado(id: string): Promise<Empleado | null> {
  const r = await rows("SELECT datosJson FROM empleados WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function getEmpleadoPorRfc(empresaId: string, rfc: string): Promise<Empleado | null> {
  const r = await rows("SELECT datosJson FROM empleados WHERE empresaId = ? AND rfc = ? LIMIT 1", [empresaId, rfc]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function guardarEmpleado(e: Empleado): Promise<void> {
  await run(
    `INSERT INTO empleados (id, empresaId, nombre, rfc, activo, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), rfc = VALUES(rfc), activo = VALUES(activo), datosJson = VALUES(datosJson)`,
    [e.id, e.empresaId, e.nombre, e.rfc, e.activo ? 1 : 0, JSON.stringify(e), e.creadoEl],
  );
}

export async function eliminarEmpleado(empresaId: string, id: string): Promise<void> {
  await run("DELETE FROM empleados WHERE id = ? AND empresaId = ?", [id, empresaId]);
}

export function nuevoEmpleadoId(): string {
  return crypto.randomUUID();
}

/* ---------- Recibos de nómina ---------- */

export async function guardarRecibo(r: ReciboNomina): Promise<void> {
  await run(
    `INSERT INTO nominas (id, empresaId, empleadoId, periodoInicio, periodoFin, estado, uuid, neto, datosJson, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), uuid = VALUES(uuid), neto = VALUES(neto), datosJson = VALUES(datosJson)`,
    [r.id, r.empresaId, r.empleadoId, r.periodoInicio, r.periodoFin, r.estado, r.uuid ?? null, r.calculo.neto, JSON.stringify(r), r.creadoEl],
  );
}

export async function getRecibo(id: string): Promise<ReciboNomina | null> {
  const r = await rows("SELECT datosJson FROM nominas WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function getReciboPeriodo(
  empresaId: string,
  empleadoId: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<ReciboNomina | null> {
  const r = await rows(
    "SELECT datosJson FROM nominas WHERE empresaId = ? AND empleadoId = ? AND periodoInicio = ? AND periodoFin = ?",
    [empresaId, empleadoId, periodoInicio, periodoFin],
  );
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function listarRecibos(empresaId: string, limite = 200): Promise<ReciboNomina[]> {
  const r = await rows(
    "SELECT datosJson FROM nominas WHERE empresaId = ? ORDER BY periodoInicio DESC, creadoEl DESC LIMIT ?",
    [empresaId, limite],
  );
  return r.map((x) => JSON.parse(String(x.datosJson)));
}

/* ---------- Configuración patronal ---------- */

const CONFIG_DEFAULT: ConfigNomina = {
  registroPatronal: "",
  claveEntFed: "CMX",
  primaRiesgo: PARAMETROS_DEFAULT.primaRiesgo,
  uma: PARAMETROS_DEFAULT.uma,
  salarioMinimo: PARAMETROS_DEFAULT.salarioMinimo,
  subsidioMensual: PARAMETROS_DEFAULT.subsidioMensual,
  subsidioTopeIngresos: PARAMETROS_DEFAULT.subsidioTopeIngresos,
};

export async function getConfigNomina(empresaId: string): Promise<ConfigNomina> {
  const r = await rows("SELECT datosJson FROM config_nomina WHERE empresaId = ?", [empresaId]);
  return r[0] ? { ...CONFIG_DEFAULT, ...JSON.parse(String(r[0].datosJson)) } : { ...CONFIG_DEFAULT };
}

export async function guardarConfigNomina(empresaId: string, cfg: ConfigNomina): Promise<void> {
  await run(
    `INSERT INTO config_nomina (empresaId, datosJson) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE datosJson = VALUES(datosJson)`,
    [empresaId, JSON.stringify(cfg)],
  );
}
