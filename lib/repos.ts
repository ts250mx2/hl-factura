import crypto from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "./sql";
import type {
  Alerta,
  CertificadoInfo,
  CfdiDescargado,
  Cliente,
  ConfigPac,
  ConfigSmtp,
  ConfigSync,
  CxpEstado,
  Despacho,
  Emisor,
  Factura,
  PagoRep,
  Producto,
  RegistroSync,
  Rol,
  SolicitudDescarga,
  Usuario,
} from "./types";

export function genId(): string {
  return crypto.randomUUID();
}

type Row = RowDataPacket;

async function rows(sql: string, params: unknown[] = []): Promise<Row[]> {
  const pool = await db();
  const [result] = await pool.query<Row[]>(sql, params);
  return result;
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  const pool = await db();
  await pool.query(sql, params);
}

/* ---------- Despachos ---------- */

export async function contarUsuarios(): Promise<number> {
  const r = await rows("SELECT COUNT(*) AS n FROM usuarios");
  return Number(r[0].n);
}

export async function crearDespacho(nombre: string): Promise<Despacho> {
  const d: Despacho = { id: genId(), nombre, creadoEl: new Date().toISOString() };
  await run("INSERT INTO despachos (id, nombre, creadoEl) VALUES (?, ?, ?)", [d.id, d.nombre, d.creadoEl]);
  return d;
}

export async function getDespacho(id: string): Promise<Despacho | null> {
  const r = await rows("SELECT * FROM despachos WHERE id = ?", [id]);
  return r[0] ? { id: String(r[0].id), nombre: String(r[0].nombre), creadoEl: String(r[0].creadoEl) } : null;
}

/* ---------- Usuarios ---------- */

function mapUsuario(r: Row, empresaIds: string[]): Usuario {
  return {
    id: String(r.id),
    despachoId: String(r.despachoId),
    email: String(r.email),
    nombre: String(r.nombre),
    rol: r.rol as Rol,
    activo: Boolean(r.activo),
    empresaIds,
    creadoEl: String(r.creadoEl),
  };
}

async function empresasDeUsuario(usuarioId: string): Promise<string[]> {
  const r = await rows("SELECT empresaId FROM usuario_empresas WHERE usuarioId = ?", [usuarioId]);
  return r.map((x) => String(x.empresaId));
}

export async function crearUsuario(u: {
  despachoId: string;
  email: string;
  nombre: string;
  passwordHash: string;
  rol: Rol;
  empresaIds?: string[];
}): Promise<Usuario> {
  const id = genId();
  const now = new Date().toISOString();
  await run(
    "INSERT INTO usuarios (id, despachoId, email, nombre, passwordHash, rol, activo, creadoEl) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    [id, u.despachoId, u.email.toLowerCase(), u.nombre, u.passwordHash, u.rol, now],
  );
  await asignarEmpresas(id, u.empresaIds ?? []);
  return (await getUsuario(id))!;
}

export async function asignarEmpresas(usuarioId: string, empresaIds: string[]): Promise<void> {
  await run("DELETE FROM usuario_empresas WHERE usuarioId = ?", [usuarioId]);
  for (const eid of empresaIds) {
    await run("INSERT IGNORE INTO usuario_empresas (usuarioId, empresaId) VALUES (?, ?)", [usuarioId, eid]);
  }
}

export async function getUsuario(id: string): Promise<Usuario | null> {
  const r = await rows("SELECT * FROM usuarios WHERE id = ?", [id]);
  if (!r[0]) return null;
  return mapUsuario(r[0], await empresasDeUsuario(id));
}

export async function getUsuarioPorEmail(email: string): Promise<(Usuario & { passwordHash: string }) | null> {
  const r = await rows("SELECT * FROM usuarios WHERE email = ?", [email.toLowerCase()]);
  if (!r[0]) return null;
  return { ...mapUsuario(r[0], await empresasDeUsuario(String(r[0].id))), passwordHash: String(r[0].passwordHash) };
}

export async function listarUsuarios(despachoId: string): Promise<Usuario[]> {
  const usuarios = await rows("SELECT * FROM usuarios WHERE despachoId = ? ORDER BY creadoEl", [despachoId]);
  if (usuarios.length === 0) return [];
  const asignaciones = await rows(
    "SELECT usuarioId, empresaId FROM usuario_empresas WHERE usuarioId IN (?)",
    [usuarios.map((u) => String(u.id))],
  );
  const porUsuario = new Map<string, string[]>();
  for (const a of asignaciones) {
    const lista = porUsuario.get(String(a.usuarioId)) ?? [];
    lista.push(String(a.empresaId));
    porUsuario.set(String(a.usuarioId), lista);
  }
  return usuarios.map((u) => mapUsuario(u, porUsuario.get(String(u.id)) ?? []));
}

export async function actualizarUsuario(
  id: string,
  patch: { nombre?: string; rol?: Rol; activo?: boolean; passwordHash?: string },
): Promise<void> {
  if (patch.nombre !== undefined) await run("UPDATE usuarios SET nombre = ? WHERE id = ?", [patch.nombre, id]);
  if (patch.rol !== undefined) await run("UPDATE usuarios SET rol = ? WHERE id = ?", [patch.rol, id]);
  if (patch.activo !== undefined) await run("UPDATE usuarios SET activo = ? WHERE id = ?", [patch.activo ? 1 : 0, id]);
  if (patch.passwordHash !== undefined) {
    await run("UPDATE usuarios SET passwordHash = ? WHERE id = ?", [patch.passwordHash, id]);
  }
}

export async function eliminarUsuario(id: string): Promise<void> {
  await run("DELETE FROM usuario_empresas WHERE usuarioId = ?", [id]);
  await run("DELETE FROM sesiones WHERE usuarioId = ?", [id]);
  await run("DELETE FROM usuarios WHERE id = ?", [id]);
}

/* ---------- Sesiones ---------- */

export async function crearSesion(usuarioId: string, dias = 30): Promise<string> {
  const id = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  await run("INSERT INTO sesiones (id, usuarioId, expiraEl, creadoEl) VALUES (?, ?, ?, ?)", [
    id,
    usuarioId,
    new Date(now.getTime() + dias * 86_400_000).toISOString(),
    now.toISOString(),
  ]);
  return id;
}

export async function getSesion(id: string): Promise<{ usuario: Usuario } | null> {
  if (!id) return null;
  const r = await rows("SELECT * FROM sesiones WHERE id = ?", [id]);
  if (!r[0]) return null;
  if (new Date(String(r[0].expiraEl)) < new Date()) {
    await run("DELETE FROM sesiones WHERE id = ?", [id]);
    return null;
  }
  const usuario = await getUsuario(String(r[0].usuarioId));
  if (!usuario || !usuario.activo) return null;
  return { usuario };
}

export async function eliminarSesion(id: string): Promise<void> {
  await run("DELETE FROM sesiones WHERE id = ?", [id]);
}

/* ---------- Empresas (RFCs administrados) ---------- */

function mapEmpresa(r: Row): Emisor {
  return {
    id: String(r.id),
    despachoId: String(r.despachoId),
    rfc: String(r.rfc),
    nombre: String(r.nombre),
    regimenFiscal: String(r.regimenFiscal),
    codigoPostal: String(r.codigoPostal),
    serie: String(r.serie),
    folioActual: Number(r.folioActual),
    folioPagoActual: Number(r.folioPagoActual ?? 1),
    colorTag: String(r.colorTag),
    csd: r.csdJson ? JSON.parse(String(r.csdJson)) : null,
    fiel: r.fielJson ? JSON.parse(String(r.fielJson)) : null,
    creadoEl: String(r.creadoEl),
  };
}

/** Versión del certificado segura para enviar al cliente: sin la contraseña ni
 *  los bytes de las llaves (el .key jamás debe salir al navegador). */
export function certificadoPublico(info: CertificadoInfo | null | undefined) {
  if (!info) return null;
  return { ...info, passwordEnc: undefined, cerB64: undefined, keyB64: undefined, cerPath: undefined, keyPath: undefined };
}

export async function listarEmpresas(despachoId: string): Promise<Emisor[]> {
  const r = await rows("SELECT * FROM empresas WHERE despachoId = ? ORDER BY creadoEl", [despachoId]);
  return r.map(mapEmpresa);
}

export async function getEmpresa(id: string): Promise<Emisor | null> {
  const r = await rows("SELECT * FROM empresas WHERE id = ?", [id]);
  return r[0] ? mapEmpresa(r[0]) : null;
}

export async function insertarEmpresa(e: Emisor): Promise<void> {
  await run(
    `INSERT INTO empresas (id, despachoId, rfc, nombre, regimenFiscal, codigoPostal, serie, folioActual, colorTag, csdJson, fielJson, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.id, e.despachoId, e.rfc, e.nombre, e.regimenFiscal, e.codigoPostal, e.serie,
      e.folioActual, e.colorTag, e.csd ? JSON.stringify(e.csd) : null,
      e.fiel ? JSON.stringify(e.fiel) : null, e.creadoEl,
    ],
  );
}

export async function actualizarEmpresa(e: Emisor): Promise<void> {
  await run(
    `UPDATE empresas SET nombre = ?, regimenFiscal = ?, codigoPostal = ?, serie = ?, folioActual = ?, csdJson = ?, fielJson = ? WHERE id = ?`,
    [
      e.nombre, e.regimenFiscal, e.codigoPostal, e.serie, e.folioActual,
      e.csd ? JSON.stringify(e.csd) : null, e.fiel ? JSON.stringify(e.fiel) : null, e.id,
    ],
  );
}

export async function eliminarEmpresa(id: string): Promise<void> {
  await run("DELETE FROM clientes WHERE empresaId = ?", [id]);
  await run("DELETE FROM productos WHERE empresaId = ?", [id]);
  await run("DELETE FROM descargas WHERE empresaId = ?", [id]);
  await run("DELETE FROM usuario_empresas WHERE empresaId = ?", [id]);
  await run("DELETE FROM empresas WHERE id = ?", [id]);
}

export async function incrementarFolio(empresaId: string): Promise<void> {
  await run("UPDATE empresas SET folioActual = folioActual + 1 WHERE id = ?", [empresaId]);
}

export async function incrementarFolioPago(empresaId: string): Promise<void> {
  await run("UPDATE empresas SET folioPagoActual = folioPagoActual + 1 WHERE id = ?", [empresaId]);
}

/* ---------- Clientes ---------- */

export async function listarClientes(empresaId: string): Promise<Cliente[]> {
  const r = await rows("SELECT datosJson FROM clientes WHERE empresaId = ? ORDER BY creadoEl", [empresaId]);
  return r.map((x) => JSON.parse(String(x.datosJson)));
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const r = await rows("SELECT datosJson FROM clientes WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

/** Busca un cliente por RFC dentro de una empresa (para deduplicar al derivar de la bóveda). */
export async function getClientePorRfc(empresaId: string, rfc: string): Promise<Cliente | null> {
  const r = await rows("SELECT datosJson FROM clientes WHERE empresaId = ? AND rfc = ? LIMIT 1", [empresaId, rfc]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function guardarCliente(c: Cliente): Promise<void> {
  await run(
    `INSERT INTO clientes (id, empresaId, rfc, nombre, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE rfc = VALUES(rfc), nombre = VALUES(nombre), datosJson = VALUES(datosJson)`,
    [c.id, c.empresaId, c.rfc, c.nombre, JSON.stringify(c), c.creadoEl],
  );
}

export async function eliminarCliente(id: string): Promise<void> {
  await run("DELETE FROM clientes WHERE id = ?", [id]);
}

/**
 * Borra los clientes creados por descarga (origen "descarga") cuyo RFC solo
 * aparece como receptor de CFDI de nómina (empleados), no de ingresos/egresos.
 * Corrige el caso en que una sincronización previa metió empleados como
 * clientes. Devuelve cuántos borró. No toca clientes capturados a mano.
 */
export async function eliminarClientesNominaHuerfanos(empresaId: string): Promise<number> {
  const pool = await db();
  const [res] = await pool.query(
    `DELETE FROM clientes
       WHERE empresaId = ?
         AND JSON_EXTRACT(datosJson, '$.origen') = 'descarga'
         AND rfc IN (SELECT DISTINCT receptorRfc FROM cfdi_descargados WHERE empresaId = ? AND tipoComprobante = 'N')
         AND rfc NOT IN (SELECT DISTINCT receptorRfc FROM cfdi_descargados WHERE empresaId = ? AND tipoComprobante IN ('I','E'))`,
    [empresaId, empresaId, empresaId],
  );
  return (res as { affectedRows?: number }).affectedRows ?? 0;
}

/* ---------- Productos ---------- */

export async function listarProductos(empresaId: string): Promise<Producto[]> {
  const r = await rows("SELECT datosJson FROM productos WHERE empresaId = ? ORDER BY creadoEl", [empresaId]);
  return r.map((x) => JSON.parse(String(x.datosJson)));
}

export async function getProducto(id: string): Promise<Producto | null> {
  const r = await rows("SELECT datosJson FROM productos WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function guardarProducto(p: Producto): Promise<void> {
  await run(
    `INSERT INTO productos (id, empresaId, descripcion, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), datosJson = VALUES(datosJson)`,
    [p.id, p.empresaId, p.descripcion, JSON.stringify(p), p.creadoEl],
  );
}

export async function eliminarProducto(id: string): Promise<void> {
  await run("DELETE FROM productos WHERE id = ?", [id]);
}

/* ---------- Facturas ---------- */

export async function listarFacturas(
  empresaIds: string[],
  filtros?: { estado?: string; q?: string },
): Promise<Factura[]> {
  if (empresaIds.length === 0) return [];
  let sql = "SELECT datosJson FROM facturas WHERE empresaId IN (?)";
  const params: unknown[] = [empresaIds];
  if (filtros?.estado) {
    sql += " AND estado = ?";
    params.push(filtros.estado);
  }
  sql += " ORDER BY creadoEl DESC LIMIT 500";
  const r = await rows(sql, params);
  let facturas = r.map((x) => JSON.parse(String(x.datosJson)) as Factura);
  if (filtros?.q) {
    const q = filtros.q.toLowerCase();
    facturas = facturas.filter(
      (f) =>
        f.receptorNombre.toLowerCase().includes(q) ||
        f.receptorRfc.toLowerCase().includes(q) ||
        `${f.serie}${f.folio}`.toLowerCase().includes(q) ||
        (f.uuid ?? "").toLowerCase().includes(q),
    );
  }
  return facturas;
}

export async function getFactura(id: string): Promise<Factura | null> {
  const r = await rows("SELECT datosJson FROM facturas WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

/** Busca una factura por UUID dentro de una empresa (dedup al derivar de la bóveda). */
export async function getFacturaPorUuid(empresaId: string, uuid: string): Promise<Factura | null> {
  const r = await rows("SELECT datosJson FROM facturas WHERE empresaId = ? AND uuid = ? LIMIT 1", [empresaId, uuid]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function guardarFactura(f: Factura): Promise<void> {
  await run(
    `INSERT INTO facturas (id, empresaId, clienteId, estado, uuid, serie, folio, receptorRfc, receptorNombre, total, datosJson, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), uuid = VALUES(uuid), total = VALUES(total), datosJson = VALUES(datosJson)`,
    [f.id, f.emisorId, f.clienteId ?? null, f.estado, f.uuid ?? null, f.serie, f.folio, f.receptorRfc, f.receptorNombre, f.total, JSON.stringify(f), f.creadoEl],
  );
}

export async function eliminarFactura(id: string): Promise<void> {
  await run("DELETE FROM facturas WHERE id = ?", [id]);
}

export async function facturasTimbradasDeCliente(clienteId: string): Promise<boolean> {
  const r = await rows("SELECT 1 AS x FROM facturas WHERE clienteId = ? AND estado = 'timbrada' LIMIT 1", [clienteId]);
  return r.length > 0;
}

/* ---------- Descargas ---------- */

export async function listarDescargas(empresaIds: string[]): Promise<SolicitudDescarga[]> {
  if (empresaIds.length === 0) return [];
  const r = await rows("SELECT datosJson FROM descargas WHERE empresaId IN (?) ORDER BY creadoEl DESC", [empresaIds]);
  return r.map((x) => JSON.parse(String(x.datosJson)));
}

export async function getDescarga(id: string): Promise<SolicitudDescarga | null> {
  const r = await rows("SELECT datosJson FROM descargas WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function guardarDescarga(s: SolicitudDescarga): Promise<void> {
  await run(
    `INSERT INTO descargas (id, empresaId, estado, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), datosJson = VALUES(datosJson)`,
    [s.id, s.emisorId, s.estado, JSON.stringify(s), s.creadoEl],
  );
}

/* ---------- Configuración PAC por despacho ---------- */

const PAC_DEFAULT: ConfigPac = {
  modo: "demo",
  swUrlServices: "https://services.test.sw.com.mx",
  swUrlApi: "https://api.test.sw.com.mx",
};

export async function getConfigPac(despachoId: string): Promise<ConfigPac> {
  const r = await rows("SELECT pacJson FROM config_despacho WHERE despachoId = ?", [despachoId]);
  return r[0] ? { ...PAC_DEFAULT, ...JSON.parse(String(r[0].pacJson)) } : { ...PAC_DEFAULT };
}

export async function guardarConfigPac(despachoId: string, pac: ConfigPac): Promise<void> {
  await run(
    `INSERT INTO config_despacho (despachoId, pacJson) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE pacJson = VALUES(pacJson)`,
    [despachoId, JSON.stringify(pac)],
  );
}

/* ---------- Bóveda de CFDI descargados ---------- */

function mapCfdi(r: Row): CfdiDescargado {
  return {
    uuid: String(r.uuid),
    empresaId: String(r.empresaId),
    tipo: r.tipo as CfdiDescargado["tipo"],
    tipoComprobante: r.tipoComprobante ? String(r.tipoComprobante) : undefined,
    emisorRfc: String(r.emisorRfc),
    emisorNombre: r.emisorNombre ? String(r.emisorNombre) : undefined,
    receptorRfc: String(r.receptorRfc),
    receptorNombre: r.receptorNombre ? String(r.receptorNombre) : undefined,
    fecha: String(r.fecha),
    total: Number(r.total),
    metodoPago: r.metodoPago ? String(r.metodoPago) : undefined,
    formaPago: r.formaPago ? String(r.formaPago) : undefined,
    estatusSat: r.estatusSat as CfdiDescargado["estatusSat"],
    xmlPath: r.xmlPath ? String(r.xmlPath) : undefined,
    efos: r.efos ? (String(r.efos) as CfdiDescargado["efos"]) : null,
    deducible: r.deducible as CfdiDescargado["deducible"],
    motivoNoDeducible: r.motivoNoDeducible ? String(r.motivoNoDeducible) : undefined,
    actualizadoEl: String(r.actualizadoEl),
  };
}

export async function upsertCfdiDescargado(c: CfdiDescargado): Promise<void> {
  await run(
    `INSERT INTO cfdi_descargados
       (uuid, empresaId, tipo, tipoComprobante, emisorRfc, emisorNombre, receptorRfc, receptorNombre,
        fecha, total, metodoPago, formaPago, estatusSat, xmlPath, efos, deducible, motivoNoDeducible, actualizadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       tipoComprobante = COALESCE(VALUES(tipoComprobante), tipoComprobante),
       emisorNombre = COALESCE(VALUES(emisorNombre), emisorNombre),
       receptorNombre = COALESCE(VALUES(receptorNombre), receptorNombre),
       metodoPago = COALESCE(VALUES(metodoPago), metodoPago),
       formaPago = COALESCE(VALUES(formaPago), formaPago),
       estatusSat = VALUES(estatusSat),
       xmlPath = COALESCE(VALUES(xmlPath), xmlPath),
       efos = VALUES(efos),
       deducible = VALUES(deducible),
       motivoNoDeducible = VALUES(motivoNoDeducible),
       actualizadoEl = VALUES(actualizadoEl)`,
    [
      c.uuid, c.empresaId, c.tipo, c.tipoComprobante ?? null, c.emisorRfc, c.emisorNombre ?? null,
      c.receptorRfc, c.receptorNombre ?? null, c.fecha, c.total, c.metodoPago ?? null, c.formaPago ?? null,
      c.estatusSat, c.xmlPath ?? null, c.efos ?? null, c.deducible, c.motivoNoDeducible ?? null, c.actualizadoEl,
    ],
  );
}

export async function getCfdiDescargado(uuid: string, empresaId: string): Promise<CfdiDescargado | null> {
  const r = await rows("SELECT * FROM cfdi_descargados WHERE uuid = ? AND empresaId = ?", [uuid, empresaId]);
  return r[0] ? mapCfdi(r[0]) : null;
}

export async function listarBoveda(
  empresaIds: string[],
  filtros?: { tipo?: string; problema?: string; q?: string; limite?: number },
): Promise<CfdiDescargado[]> {
  if (empresaIds.length === 0) return [];
  let sql = "SELECT * FROM cfdi_descargados WHERE empresaId IN (?)";
  const params: unknown[] = [empresaIds];
  if (filtros?.tipo === "emitida" || filtros?.tipo === "recibida") {
    sql += " AND tipo = ?";
    params.push(filtros.tipo);
  }
  if (filtros?.problema === "cancelado") sql += " AND estatusSat = 'cancelado'";
  if (filtros?.problema === "no_deducible") sql += " AND deducible <> 'ok'";
  if (filtros?.problema === "efos") sql += " AND efos IS NOT NULL";
  if (filtros?.q) {
    sql += " AND (uuid LIKE ? OR emisorRfc LIKE ? OR receptorRfc LIKE ? OR emisorNombre LIKE ? OR receptorNombre LIKE ?)";
    const like = `%${filtros.q}%`;
    params.push(like, like, like, like, like);
  }
  sql += " ORDER BY fecha DESC LIMIT ?";
  params.push(Math.min(filtros?.limite ?? 300, 1000));
  const r = await rows(sql, params);
  return r.map(mapCfdi);
}

export async function resumenBoveda(empresaIds: string[]) {
  if (empresaIds.length === 0) return { total: 0, emitidas: 0, recibidas: 0, cancelados: 0, noDeducibles: 0, efos: 0 };
  const r = await rows(
    `SELECT
       COUNT(*) AS total,
       SUM(tipo = 'emitida') AS emitidas,
       SUM(tipo = 'recibida') AS recibidas,
       SUM(estatusSat = 'cancelado') AS cancelados,
       SUM(deducible <> 'ok') AS noDeducibles,
       SUM(efos IS NOT NULL) AS efos
     FROM cfdi_descargados WHERE empresaId IN (?)`,
    [empresaIds],
  );
  const x = r[0] ?? {};
  return {
    total: Number(x.total ?? 0),
    emitidas: Number(x.emitidas ?? 0),
    recibidas: Number(x.recibidas ?? 0),
    cancelados: Number(x.cancelados ?? 0),
    noDeducibles: Number(x.noDeducibles ?? 0),
    efos: Number(x.efos ?? 0),
  };
}

export async function emisoresRecibidosDistintos(): Promise<string[]> {
  const r = await rows("SELECT DISTINCT emisorRfc FROM cfdi_descargados WHERE tipo = 'recibida'");
  return r.map((x) => String(x.emisorRfc));
}

export async function cfdisRecibidosPorEmisor(situacionRfcs: string[]): Promise<CfdiDescargado[]> {
  if (situacionRfcs.length === 0) return [];
  const r = await rows(
    "SELECT * FROM cfdi_descargados WHERE tipo = 'recibida' AND efos IS NULL AND emisorRfc IN (?)",
    [situacionRfcs],
  );
  return r.map(mapCfdi);
}

/* ---------- Alertas ---------- */

export async function crearAlerta(a: Omit<Alerta, "id" | "leida" | "creadoEl">): Promise<void> {
  await run(
    `INSERT INTO alertas (id, despachoId, empresaId, tipo, severidad, titulo, detalle, uuid, leida, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [genId(), a.despachoId, a.empresaId ?? null, a.tipo, a.severidad, a.titulo, a.detalle, a.uuid ?? null, new Date().toISOString()],
  );
}

function mapAlerta(r: Row): Alerta {
  return {
    id: String(r.id),
    despachoId: String(r.despachoId),
    empresaId: r.empresaId ? String(r.empresaId) : undefined,
    tipo: r.tipo as Alerta["tipo"],
    severidad: r.severidad as Alerta["severidad"],
    titulo: String(r.titulo),
    detalle: String(r.detalle),
    uuid: r.uuid ? String(r.uuid) : undefined,
    leida: Boolean(r.leida),
    creadoEl: String(r.creadoEl),
  };
}

export async function listarAlertas(
  despachoId: string,
  empresaIds: string[],
  opts?: { soloNoLeidas?: boolean; limite?: number },
): Promise<Alerta[]> {
  let sql = "SELECT * FROM alertas WHERE despachoId = ? AND (empresaId IS NULL OR empresaId IN (?))";
  const params: unknown[] = [despachoId, empresaIds.length ? empresaIds : [""]];
  if (opts?.soloNoLeidas) sql += " AND leida = 0";
  sql += " ORDER BY creadoEl DESC LIMIT ?";
  params.push(opts?.limite ?? 200);
  const r = await rows(sql, params);
  return r.map(mapAlerta);
}

export async function contarAlertasNoLeidas(despachoId: string, empresaIds: string[]): Promise<number> {
  const r = await rows(
    "SELECT COUNT(*) AS n FROM alertas WHERE despachoId = ? AND leida = 0 AND (empresaId IS NULL OR empresaId IN (?))",
    [despachoId, empresaIds.length ? empresaIds : [""]],
  );
  return Number(r[0].n);
}

export async function marcarAlertasLeidas(despachoId: string, ids: string[] | "todas"): Promise<void> {
  if (ids === "todas") {
    await run("UPDATE alertas SET leida = 1 WHERE despachoId = ?", [despachoId]);
  } else if (ids.length) {
    await run("UPDATE alertas SET leida = 1 WHERE despachoId = ? AND id IN (?)", [despachoId, ids]);
  }
}

/** Evita duplicar la misma alerta (mismo tipo + uuid) si ya existe sin leer. */
export async function existeAlerta(despachoId: string, tipo: string, uuid: string): Promise<boolean> {
  const r = await rows(
    "SELECT 1 AS x FROM alertas WHERE despachoId = ? AND tipo = ? AND uuid = ? LIMIT 1",
    [despachoId, tipo, uuid],
  );
  return r.length > 0;
}

/* ---------- EFOS (lista 69-B) ---------- */

export async function reemplazarEfos(lista: { rfc: string; nombre: string; situacion: string }[]): Promise<void> {
  const pool = await db();
  await pool.query("DELETE FROM efos");
  const ahora = new Date().toISOString();
  const LOTE = 500;
  for (let i = 0; i < lista.length; i += LOTE) {
    const bloque = lista.slice(i, i + LOTE);
    const values = bloque.map(() => "(?, ?, ?, ?)").join(",");
    const params = bloque.flatMap((e) => [e.rfc, e.nombre.slice(0, 490), e.situacion, ahora]);
    await pool.query(
      `INSERT INTO efos (rfc, nombre, situacion, actualizadoEl) VALUES ${values}
       ON DUPLICATE KEY UPDATE situacion = VALUES(situacion), nombre = VALUES(nombre), actualizadoEl = VALUES(actualizadoEl)`,
      params,
    );
  }
}

export async function buscarEfos(rfcs: string[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (rfcs.length === 0) return resultado;
  const r = await rows("SELECT rfc, situacion FROM efos WHERE rfc IN (?)", [rfcs]);
  for (const x of r) resultado.set(String(x.rfc), String(x.situacion));
  return resultado;
}

export async function estadoEfos(): Promise<{ total: number; actualizadoEl: string | null }> {
  const r = await rows("SELECT COUNT(*) AS n, MAX(actualizadoEl) AS f FROM efos");
  return { total: Number(r[0].n), actualizadoEl: r[0].f ? String(r[0].f) : null };
}

export async function rfcsEnSituacion(situaciones: string[]): Promise<{ rfc: string; nombre: string; situacion: string }[]> {
  if (!situaciones.length) return [];
  const r = await rows("SELECT rfc, nombre, situacion FROM efos WHERE situacion IN (?)", [situaciones]);
  return r.map((x) => ({ rfc: String(x.rfc), nombre: String(x.nombre ?? ""), situacion: String(x.situacion) }));
}

/* ---------- Configuración y registro de sincronización ---------- */

const SYNC_DEFAULT: ConfigSync = {
  activada: false,
  hora: "03:00",
  ventanaDias: 3,
  emitidas: true,
  recibidas: true,
  metadata: true,
};

export async function getConfigSync(despachoId: string): Promise<ConfigSync> {
  const r = await rows("SELECT datosJson FROM config_sync WHERE despachoId = ?", [despachoId]);
  return r[0] ? { ...SYNC_DEFAULT, ...JSON.parse(String(r[0].datosJson)) } : { ...SYNC_DEFAULT };
}

export async function guardarConfigSync(despachoId: string, cfg: ConfigSync): Promise<void> {
  await run(
    `INSERT INTO config_sync (despachoId, datosJson) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE datosJson = VALUES(datosJson)`,
    [despachoId, JSON.stringify(cfg)],
  );
}

export async function despachosConSync(): Promise<{ despachoId: string; cfg: ConfigSync }[]> {
  const r = await rows("SELECT despachoId, datosJson FROM config_sync");
  return r
    .map((x) => ({ despachoId: String(x.despachoId), cfg: { ...SYNC_DEFAULT, ...JSON.parse(String(x.datosJson)) } as ConfigSync }))
    .filter((x) => x.cfg.activada);
}

export async function registrarSync(reg: RegistroSync): Promise<void> {
  await run(
    `INSERT INTO sincronizaciones (id, despachoId, inicio, fin, resultado, detalle) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE fin = VALUES(fin), resultado = VALUES(resultado), detalle = VALUES(detalle)`,
    [reg.id, reg.despachoId, reg.inicio, reg.fin ?? null, reg.resultado, reg.detalle],
  );
}

export async function listarSyncs(despachoId: string, limite = 10): Promise<RegistroSync[]> {
  const r = await rows(
    "SELECT * FROM sincronizaciones WHERE despachoId = ? ORDER BY inicio DESC LIMIT ?",
    [despachoId, limite],
  );
  return r.map((x) => ({
    id: String(x.id),
    despachoId: String(x.despachoId),
    inicio: String(x.inicio),
    fin: x.fin ? String(x.fin) : undefined,
    resultado: x.resultado as RegistroSync["resultado"],
    detalle: String(x.detalle),
  }));
}

/* ---------- Complementos de pago (REP 2.0) ---------- */

export async function guardarPagoRep(p: PagoRep): Promise<void> {
  await run(
    `INSERT INTO pagos_rep (id, empresaId, clienteId, estado, uuid, monto, fechaPago, datosJson, creadoEl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), uuid = VALUES(uuid), datosJson = VALUES(datosJson)`,
    [p.id, p.empresaId, p.clienteId, p.estado, p.uuid ?? null, p.monto, p.fechaPago, JSON.stringify(p), p.creadoEl],
  );
  await run("DELETE FROM pago_doctos WHERE pagoId = ?", [p.id]);
  for (const d of p.doctos) {
    await run(
      "INSERT INTO pago_doctos (pagoId, empresaId, facturaId, pagado) VALUES (?, ?, ?, ?)",
      [p.id, p.empresaId, d.facturaId, d.pagado],
    );
  }
}

export async function getPagoRep(id: string): Promise<PagoRep | null> {
  const r = await rows("SELECT datosJson FROM pagos_rep WHERE id = ?", [id]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

/** Busca un REP por UUID dentro de una empresa (dedup al derivar de la bóveda). */
export async function getPagoRepPorUuid(empresaId: string, uuid: string): Promise<PagoRep | null> {
  const r = await rows("SELECT datosJson FROM pagos_rep WHERE empresaId = ? AND uuid = ? LIMIT 1", [empresaId, uuid]);
  return r[0] ? JSON.parse(String(r[0].datosJson)) : null;
}

export async function listarPagosRep(empresaIds: string[]): Promise<PagoRep[]> {
  if (empresaIds.length === 0) return [];
  const r = await rows(
    "SELECT datosJson FROM pagos_rep WHERE empresaId IN (?) ORDER BY creadoEl DESC LIMIT 300",
    [empresaIds],
  );
  return r.map((x) => JSON.parse(String(x.datosJson)));
}

/** Suma de pagos timbrados aplicados a cada factura + número de parcialidades. */
export async function saldosDeFacturas(
  facturaIds: string[],
): Promise<Map<string, { pagado: number; parcialidades: number }>> {
  const resultado = new Map<string, { pagado: number; parcialidades: number }>();
  if (facturaIds.length === 0) return resultado;
  const r = await rows(
    `SELECT pd.facturaId, SUM(pd.pagado) AS pagado, COUNT(*) AS parcialidades
     FROM pago_doctos pd
     JOIN pagos_rep pr ON pr.id = pd.pagoId
     WHERE pd.facturaId IN (?) AND pr.estado = 'timbrada'
     GROUP BY pd.facturaId`,
    [facturaIds],
  );
  for (const x of r) {
    resultado.set(String(x.facturaId), { pagado: Number(x.pagado), parcialidades: Number(x.parcialidades) });
  }
  return resultado;
}

/* ---------- Cuentas por pagar ---------- */

export async function upsertCxp(c: CxpEstado): Promise<void> {
  await run(
    `INSERT INTO cxp (uuid, empresaId, estadoPago, fechaProgramada, nota, actualizadoEl)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estadoPago = VALUES(estadoPago), fechaProgramada = VALUES(fechaProgramada),
       nota = VALUES(nota), actualizadoEl = VALUES(actualizadoEl)`,
    [c.uuid, c.empresaId, c.estadoPago, c.fechaProgramada ?? null, c.nota ?? null, c.actualizadoEl],
  );
}

export interface CxpItem extends CfdiDescargado {
  estadoPago: "pendiente" | "programada" | "pagada";
  fechaProgramada?: string;
  nota?: string;
}

export async function listarCxp(empresaIds: string[]): Promise<CxpItem[]> {
  if (empresaIds.length === 0) return [];
  const r = await rows(
    `SELECT c.*, x.estadoPago AS cxpEstado, x.fechaProgramada AS cxpFecha, x.nota AS cxpNota
     FROM cfdi_descargados c
     LEFT JOIN cxp x ON x.uuid = c.uuid AND x.empresaId = c.empresaId
     WHERE c.empresaId IN (?) AND c.tipo = 'recibida' AND c.tipoComprobante IN ('I', 'E')
     ORDER BY c.fecha DESC LIMIT 500`,
    [empresaIds],
  );
  return r.map((x) => ({
    uuid: String(x.uuid),
    empresaId: String(x.empresaId),
    tipo: "recibida" as const,
    tipoComprobante: x.tipoComprobante ? String(x.tipoComprobante) : undefined,
    emisorRfc: String(x.emisorRfc),
    emisorNombre: x.emisorNombre ? String(x.emisorNombre) : undefined,
    receptorRfc: String(x.receptorRfc),
    receptorNombre: x.receptorNombre ? String(x.receptorNombre) : undefined,
    fecha: String(x.fecha),
    total: Number(x.total),
    metodoPago: x.metodoPago ? String(x.metodoPago) : undefined,
    formaPago: x.formaPago ? String(x.formaPago) : undefined,
    estatusSat: x.estatusSat as CfdiDescargado["estatusSat"],
    xmlPath: x.xmlPath ? String(x.xmlPath) : undefined,
    efos: x.efos ? (String(x.efos) as CfdiDescargado["efos"]) : null,
    deducible: x.deducible as CfdiDescargado["deducible"],
    motivoNoDeducible: x.motivoNoDeducible ? String(x.motivoNoDeducible) : undefined,
    actualizadoEl: String(x.actualizadoEl),
    estadoPago: (x.cxpEstado ? String(x.cxpEstado) : "pendiente") as CxpItem["estadoPago"],
    fechaProgramada: x.cxpFecha ? String(x.cxpFecha) : undefined,
    nota: x.cxpNota ? String(x.cxpNota) : undefined,
  }));
}

/* ---------- Configuración SMTP (recordatorios de cobranza) ---------- */

const SMTP_DEFAULT: ConfigSmtp = {
  host: "",
  port: 587,
  seguro: false,
  user: "",
  from: "",
  recordatoriosAuto: false,
};

export async function getConfigSmtp(despachoId: string): Promise<ConfigSmtp> {
  const r = await rows("SELECT datosJson FROM config_smtp WHERE despachoId = ?", [despachoId]);
  return r[0] ? { ...SMTP_DEFAULT, ...JSON.parse(String(r[0].datosJson)) } : { ...SMTP_DEFAULT };
}

export async function guardarConfigSmtp(despachoId: string, cfg: ConfigSmtp): Promise<void> {
  await run(
    `INSERT INTO config_smtp (despachoId, datosJson) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE datosJson = VALUES(datosJson)`,
    [despachoId, JSON.stringify(cfg)],
  );
}

export async function solicitudesPendientesSync(): Promise<SolicitudDescarga[]> {
  const r = await rows(
    "SELECT datosJson FROM descargas WHERE estado IN ('solicitada', 'en_proceso', 'lista') ORDER BY creadoEl ASC LIMIT 100",
  );
  return r.map((x) => JSON.parse(String(x.datosJson)));
}
