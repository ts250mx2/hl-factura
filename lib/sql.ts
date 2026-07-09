import fs from "fs";
import path from "path";
import mysql, { type Pool } from "mysql2/promise";
import { DATA_DIR } from "./db";

// Base de datos MySQL. La conexión se configura vía .env:
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
// El esquema se crea automáticamente en el primer arranque.

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS despachos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    creadoEl VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS usuarios (
    id CHAR(36) NOT NULL PRIMARY KEY,
    despachoId CHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    passwordHash VARCHAR(300) NOT NULL,
    rol VARCHAR(20) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creadoEl VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_email (email),
    KEY idx_despacho (despachoId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS usuario_empresas (
    usuarioId CHAR(36) NOT NULL,
    empresaId CHAR(36) NOT NULL,
    PRIMARY KEY (usuarioId, empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sesiones (
    id CHAR(64) NOT NULL PRIMARY KEY,
    usuarioId CHAR(36) NOT NULL,
    expiraEl VARCHAR(32) NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_usuario (usuarioId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS empresas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    despachoId CHAR(36) NOT NULL,
    rfc VARCHAR(13) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    regimenFiscal VARCHAR(3) NOT NULL,
    codigoPostal VARCHAR(5) NOT NULL,
    serie VARCHAR(10) NOT NULL,
    folioActual INT NOT NULL DEFAULT 1,
    colorTag VARCHAR(9) NOT NULL,
    csdJson TEXT NULL,
    fielJson TEXT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_despacho_rfc (despachoId, rfc)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS clientes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    rfc VARCHAR(13) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    datosJson TEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS productos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    descripcion VARCHAR(1000) NOT NULL,
    datosJson TEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS facturas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    clienteId CHAR(36) NULL,
    estado VARCHAR(16) NOT NULL,
    uuid CHAR(36) NULL,
    serie VARCHAR(10) NULL,
    folio VARCHAR(20) NULL,
    receptorRfc VARCHAR(13) NULL,
    receptorNombre VARCHAR(255) NULL,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    datosJson MEDIUMTEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId, creadoEl),
    KEY idx_cliente (clienteId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS descargas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    datosJson MEDIUMTEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS config_despacho (
    despachoId CHAR(36) NOT NULL PRIMARY KEY,
    pacJson TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cfdi_descargados (
    uuid CHAR(36) NOT NULL,
    empresaId CHAR(36) NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    tipoComprobante VARCHAR(2) NULL,
    emisorRfc VARCHAR(13) NOT NULL,
    emisorNombre VARCHAR(300) NULL,
    receptorRfc VARCHAR(13) NOT NULL,
    receptorNombre VARCHAR(300) NULL,
    fecha VARCHAR(32) NOT NULL,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    metodoPago VARCHAR(3) NULL,
    formaPago VARCHAR(3) NULL,
    estatusSat VARCHAR(12) NOT NULL DEFAULT 'vigente',
    xmlPath VARCHAR(500) NULL,
    efos VARCHAR(12) NULL,
    deducible VARCHAR(16) NOT NULL DEFAULT 'ok',
    motivoNoDeducible VARCHAR(300) NULL,
    actualizadoEl VARCHAR(32) NOT NULL,
    PRIMARY KEY (uuid, empresaId),
    KEY idx_emp (empresaId, tipo, fecha),
    KEY idx_emisor (emisorRfc)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS alertas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    despachoId CHAR(36) NOT NULL,
    empresaId CHAR(36) NULL,
    tipo VARCHAR(20) NOT NULL,
    severidad VARCHAR(10) NOT NULL,
    titulo VARCHAR(300) NOT NULL,
    detalle TEXT NOT NULL,
    uuid CHAR(36) NULL,
    leida TINYINT(1) NOT NULL DEFAULT 0,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_despacho (despachoId, leida, creadoEl)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS efos (
    rfc VARCHAR(13) NOT NULL PRIMARY KEY,
    nombre VARCHAR(500) NULL,
    situacion VARCHAR(40) NOT NULL,
    actualizadoEl VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS config_sync (
    despachoId CHAR(36) NOT NULL PRIMARY KEY,
    datosJson TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sincronizaciones (
    id CHAR(36) NOT NULL PRIMARY KEY,
    despachoId CHAR(36) NOT NULL,
    inicio VARCHAR(32) NOT NULL,
    fin VARCHAR(32) NULL,
    resultado VARCHAR(16) NOT NULL,
    detalle TEXT NOT NULL,
    KEY idx_despacho (despachoId, inicio)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS pagos_rep (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    clienteId CHAR(36) NOT NULL,
    estado VARCHAR(16) NOT NULL,
    uuid CHAR(36) NULL,
    monto DECIMAL(14,2) NOT NULL DEFAULT 0,
    fechaPago VARCHAR(32) NOT NULL,
    datosJson MEDIUMTEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId, creadoEl)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS pago_doctos (
    pagoId CHAR(36) NOT NULL,
    empresaId CHAR(36) NOT NULL,
    facturaId CHAR(36) NOT NULL,
    pagado DECIMAL(14,2) NOT NULL,
    PRIMARY KEY (pagoId, facturaId),
    KEY idx_factura (facturaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cxp (
    uuid CHAR(36) NOT NULL,
    empresaId CHAR(36) NOT NULL,
    estadoPago VARCHAR(12) NOT NULL DEFAULT 'pendiente',
    fechaProgramada VARCHAR(16) NULL,
    nota VARCHAR(500) NULL,
    actualizadoEl VARCHAR(32) NOT NULL,
    PRIMARY KEY (uuid, empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS config_smtp (
    despachoId CHAR(36) NOT NULL PRIMARY KEY,
    datosJson TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cuentas (
    empresaId CHAR(36) NOT NULL,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    codigoAgrupador VARCHAR(20) NOT NULL,
    naturaleza CHAR(1) NOT NULL,
    nivel INT NOT NULL DEFAULT 2,
    PRIMARY KEY (empresaId, codigo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS polizas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    tipo VARCHAR(10) NOT NULL,
    numero INT NOT NULL,
    fecha VARCHAR(10) NOT NULL,
    mes CHAR(2) NOT NULL,
    anio CHAR(4) NOT NULL,
    concepto VARCHAR(500) NOT NULL,
    origenTipo VARCHAR(16) NOT NULL,
    origenId VARCHAR(64) NOT NULL,
    movimientosJson TEXT NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_origen (empresaId, origenTipo, origenId),
    KEY idx_periodo (empresaId, anio, mes, tipo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS reglas_contables (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    criterio VARCHAR(20) NOT NULL,
    valor VARCHAR(50) NOT NULL,
    cuentaCodigo VARCHAR(20) NOT NULL,
    nota VARCHAR(300) NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS activos_fijos (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    descripcion VARCHAR(300) NOT NULL,
    moi DECIMAL(14,2) NOT NULL,
    fechaAdquisicion VARCHAR(10) NOT NULL,
    tasaAnual DECIMAL(6,2) NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS config_fiscal (
    empresaId CHAR(36) NOT NULL PRIMARY KEY,
    datosJson TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS archivos (
    id VARCHAR(140) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NULL,
    categoria VARCHAR(20) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    nombre VARCHAR(255) NULL,
    contenido LONGBLOB NOT NULL,
    bytes INT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId, categoria)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS empleados (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    rfc VARCHAR(13) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    datosJson TEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    KEY idx_empresa (empresaId, activo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS nominas (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    empleadoId CHAR(36) NOT NULL,
    periodoInicio VARCHAR(10) NOT NULL,
    periodoFin VARCHAR(10) NOT NULL,
    estado VARCHAR(16) NOT NULL,
    uuid CHAR(36) NULL,
    neto DECIMAL(14,2) NOT NULL DEFAULT 0,
    datosJson MEDIUMTEXT NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_periodo (empresaId, empleadoId, periodoInicio, periodoFin),
    KEY idx_empresa (empresaId, periodoInicio)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS config_nomina (
    empresaId CHAR(36) NOT NULL PRIMARY KEY,
    datosJson TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS conciliaciones (
    id CHAR(36) NOT NULL PRIMARY KEY,
    empresaId CHAR(36) NOT NULL,
    hash CHAR(40) NOT NULL,
    fecha VARCHAR(10) NOT NULL,
    referencia VARCHAR(300) NULL,
    monto DECIMAL(14,2) NOT NULL,
    facturaId CHAR(36) NOT NULL,
    pagoRepId CHAR(36) NOT NULL,
    creadoEl VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_mov (empresaId, hash),
    KEY idx_empresa (empresaId, creadoEl)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS obligaciones_estado (
    empresaId CHAR(36) NOT NULL,
    clave VARCHAR(40) NOT NULL,
    periodo CHAR(7) NOT NULL,
    presentadoEl VARCHAR(32) NOT NULL,
    nota VARCHAR(300) NULL,
    PRIMARY KEY (empresaId, clave, periodo),
    KEY idx_periodo (empresaId, periodo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS lista69 (
    rfc VARCHAR(13) NOT NULL,
    supuesto VARCHAR(40) NOT NULL,
    nombre VARCHAR(500) NULL,
    actualizadoEl VARCHAR(32) NOT NULL,
    PRIMARY KEY (rfc, supuesto),
    KEY idx_rfc (rfc)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Cambios sobre tablas ya existentes: se aplican en cada arranque ignorando
// el error de "columna duplicada" (errno 1060) si ya se habían aplicado.
const MIGRACIONES: string[] = [
  `ALTER TABLE empresas ADD COLUMN folioPagoActual INT NOT NULL DEFAULT 1`,
];

declare global {
  // eslint-disable-next-line no-var
  var __hlPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __hlInit: Promise<void> | undefined;
}

function crearPool(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    connectTimeout: 15_000,
  });
}

/** Pool de MySQL con el esquema garantizado (se inicializa una sola vez). */
export async function db(): Promise<Pool> {
  if (!globalThis.__hlPool) globalThis.__hlPool = crearPool();
  if (!globalThis.__hlInit) {
    const pool = globalThis.__hlPool;
    globalThis.__hlInit = (async () => {
      for (const stmt of DDL) await pool.query(stmt);
      for (const stmt of MIGRACIONES) {
        try {
          await pool.query(stmt);
        } catch (e) {
          const errno = (e as { errno?: number }).errno;
          if (errno !== 1060) throw e; // 1060 = columna ya existe
        }
      }
    })().catch((e) => {
      // Si la inicialización falla (p. ej. sin red), permitir reintento
      globalThis.__hlInit = undefined;
      throw new Error(
        `No se pudo conectar a MySQL (${process.env.DB_HOST}:${process.env.DB_PORT ?? 3306}/${process.env.DB_NAME}): ${e instanceof Error ? e.message : e}`,
      );
    });
  }
  await globalThis.__hlInit;
  return globalThis.__hlPool;
}

/**
 * Importa los datos del formato JSON de la versión mono-usuario (data/db.json)
 * al despacho recién creado. Se ejecuta una sola vez al crear el primer despacho.
 */
export async function migrarLegacyJson(despachoId: string): Promise<{ migrado: boolean }> {
  const legacyPath = path.join(DATA_DIR, "db.json");
  if (!fs.existsSync(legacyPath)) return { migrado: false };
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    const pool = await db();
    const now = new Date().toISOString();

    for (const e of legacy.emisores ?? []) {
      await pool.query(
        `INSERT IGNORE INTO empresas (id, despachoId, rfc, nombre, regimenFiscal, codigoPostal, serie, folioActual, colorTag, csdJson, fielJson, creadoEl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id, despachoId, e.rfc, e.nombre, e.regimenFiscal, e.codigoPostal, e.serie,
          e.folioActual, e.colorTag ?? "#6366f1",
          e.csd ? JSON.stringify(e.csd) : null,
          e.fiel ? JSON.stringify(e.fiel) : null,
          e.creadoEl ?? now,
        ],
      );
    }
    const primeraEmpresa = (legacy.emisores ?? [])[0]?.id as string | undefined;
    if (primeraEmpresa) {
      for (const c of legacy.clientes ?? []) {
        await pool.query(
          `INSERT IGNORE INTO clientes (id, empresaId, rfc, nombre, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?, ?)`,
          [c.id, primeraEmpresa, c.rfc, c.nombre, JSON.stringify({ ...c, empresaId: primeraEmpresa }), c.creadoEl ?? now],
        );
      }
      for (const p of legacy.productos ?? []) {
        await pool.query(
          `INSERT IGNORE INTO productos (id, empresaId, descripcion, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?)`,
          [p.id, primeraEmpresa, p.descripcion, JSON.stringify({ ...p, empresaId: primeraEmpresa }), p.creadoEl ?? now],
        );
      }
    }
    for (const f of legacy.facturas ?? []) {
      await pool.query(
        `INSERT IGNORE INTO facturas (id, empresaId, clienteId, estado, uuid, serie, folio, receptorRfc, receptorNombre, total, datosJson, creadoEl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [f.id, f.emisorId, f.clienteId ?? null, f.estado, f.uuid ?? null, f.serie, f.folio, f.receptorRfc, f.receptorNombre, f.total, JSON.stringify(f), f.creadoEl ?? now],
      );
    }
    for (const s of legacy.descargas ?? []) {
      await pool.query(
        `INSERT IGNORE INTO descargas (id, empresaId, estado, datosJson, creadoEl) VALUES (?, ?, ?, ?, ?)`,
        [s.id, s.emisorId, s.estado, JSON.stringify(s), s.creadoEl ?? now],
      );
    }
    if (legacy.config?.pac) {
      await pool.query(
        `INSERT INTO config_despacho (despachoId, pacJson) VALUES (?, ?) ON DUPLICATE KEY UPDATE pacJson = VALUES(pacJson)`,
        [despachoId, JSON.stringify(legacy.config.pac)],
      );
    }
    fs.renameSync(legacyPath, legacyPath + ".migrado");
    return { migrado: true };
  } catch {
    return { migrado: false };
  }
}
