// Tipos centrales del portal de facturación

/* ---------- Multi-despacho ---------- */

export type Rol = "admin" | "supervisor" | "auxiliar" | "cliente";

export interface Despacho {
  id: string;
  nombre: string;
  creadoEl: string;
}

export interface Usuario {
  id: string;
  despachoId: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  /** ids de empresas permitidas (solo aplica a auxiliar y cliente) */
  empresaIds: string[];
  creadoEl: string;
}

export interface CertificadoInfo {
  tipo: "CSD" | "FIEL";
  cerPath: string;
  keyPath: string;
  passwordEnc: string; // contraseña de la llave privada, cifrada AES-256-GCM
  noCertificado: string; // serial de 20 dígitos
  rfc: string;
  nombre: string;
  curp?: string;
  validoDesde: string; // ISO
  validoHasta: string; // ISO
  emisorCert: string; // issuer (AC del SAT)
  vigente: boolean;
  subidoEl: string;
}

/** Empresa/RFC administrado por el despacho (antes "emisor"). */
export interface Emisor {
  id: string;
  despachoId: string;
  rfc: string;
  nombre: string; // razón social sin régimen de capital
  regimenFiscal: string;
  codigoPostal: string; // lugar de expedición
  serie: string;
  folioActual: number;
  folioPagoActual: number; // folios de complementos de pago (serie P)
  colorTag: string;
  csd?: CertificadoInfo | null;
  fiel?: CertificadoInfo | null;
  creadoEl: string;
}

export interface Cliente {
  id: string;
  empresaId: string;
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  codigoPostal: string; // domicilio fiscal receptor
  usoCfdi: string;
  email?: string;
  extranjero?: boolean;
  residenciaFiscal?: string;
  numRegIdTrib?: string;
  creadoEl: string;
}

export interface ImpuestosProducto {
  ivaTasa: number | null; // 0.16, 0.08, 0 — null si exento u objetoImp 01
  ivaExento: boolean;
  retIvaTasa: number | null;
  retIsrTasa: number | null;
  iepsTasa: number | null;
}

export interface Producto {
  id: string;
  empresaId: string;
  claveProdServ: string;
  claveUnidad: string;
  unidad?: string;
  noIdentificacion?: string;
  descripcion: string;
  valorUnitario: number;
  objetoImp: string; // 01 no objeto, 02 sí objeto, 03 sí objeto no desglose
  impuestos: ImpuestosProducto;
  creadoEl: string;
}

export interface ConceptoFactura {
  productoId?: string;
  claveProdServ: string;
  claveUnidad: string;
  unidad?: string;
  noIdentificacion?: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  descuento: number;
  objetoImp: string;
  impuestos: ImpuestosProducto;
  // calculados
  importe: number;
  base: number;
  ivaImporte: number;
  retIvaImporte: number;
  retIsrImporte: number;
  iepsImporte: number;
}

export type EstadoFactura =
  | "borrador"
  | "sellada"
  | "timbrada"
  | "cancelada"
  | "error";

export interface Cancelacion {
  fecha: string;
  motivo: string; // 01..04
  folioSustitucion?: string;
  estatus: string;
}

export interface Factura {
  id: string; // id interno
  emisorId: string;
  clienteId: string;
  serie: string;
  folio: string;
  fecha: string; // fecha de emisión del CFDI (local, sin zona)
  tipoDeComprobante: "I" | "E";
  formaPago: string;
  metodoPago: string;
  moneda: string;
  tipoCambio?: number;
  condicionesDePago?: string;
  usoCfdi: string;
  conceptos: ConceptoFactura[];
  subTotal: number;
  descuento: number;
  totalTraslados: number;
  totalRetenciones: number;
  total: number;
  // global (público en general)
  informacionGlobal?: { periodicidad: string; meses: string; anio: string };
  relacionados?: { tipoRelacion: string; uuids: string[] };
  // crédito (solo PPD): para cuentas por cobrar
  diasCredito?: number;
  // resultado fiscal
  estado: EstadoFactura;
  demo: boolean;
  uuid?: string; // folio fiscal
  fechaTimbrado?: string;
  selloCFD?: string;
  selloSAT?: string;
  noCertificado?: string;
  noCertificadoSAT?: string;
  rfcProvCertif?: string;
  cadenaOriginal?: string;
  xmlPath?: string;
  errorMsg?: string;
  cancelacion?: Cancelacion;
  // denormalizados para listados
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  creadoEl: string;
}

export interface ConfigPac {
  modo: "demo" | "sw";
  swUrlServices: string;
  swUrlApi: string;
  swToken?: string;
  swUser?: string;
  swPassword?: string;
}

export interface AppConfig {
  pac: ConfigPac;
}

export interface SolicitudDescarga {
  id: string;
  emisorId: string;
  emisorRfc: string;
  tipo: "emitidas" | "recibidas";
  formato: "xml" | "metadata";
  fechaInicio: string;
  fechaFin: string;
  requestId?: string;
  estado: "solicitada" | "en_proceso" | "lista" | "descargada" | "error" | "rechazada";
  mensaje?: string;
  paquetes: { id: string; zipPath?: string; descargado: boolean }[];
  origen?: "manual" | "sync";
  ingerida?: boolean; // ya se importó su contenido a la bóveda
  creadoEl: string;
  actualizadoEl: string;
}

/* ---------- Fase 2: bóveda, alertas, EFOS, sincronización ---------- */

export interface CfdiDescargado {
  uuid: string;
  empresaId: string;
  tipo: "emitida" | "recibida";
  tipoComprobante?: string; // I,E,P,N,T
  emisorRfc: string;
  emisorNombre?: string;
  receptorRfc: string;
  receptorNombre?: string;
  fecha: string;
  total: number;
  metodoPago?: string;
  formaPago?: string;
  estatusSat: "vigente" | "cancelado";
  xmlPath?: string; // null cuando solo se tiene metadata
  efos?: "presunto" | "definitivo" | null;
  deducible: "ok" | "no_deducible" | "bloqueado_efos";
  motivoNoDeducible?: string;
  actualizadoEl: string;
}

export type TipoAlerta = "efos" | "cancelado" | "deduccion" | "sync" | "csd" | "cobranza";

export interface Alerta {
  id: string;
  despachoId: string;
  empresaId?: string;
  tipo: TipoAlerta;
  severidad: "info" | "aviso" | "critica";
  titulo: string;
  detalle: string;
  uuid?: string;
  leida: boolean;
  creadoEl: string;
}

export interface ConfigSync {
  activada: boolean;
  hora: string; // "03:00"
  ventanaDias: number; // días hacia atrás por corrida
  emitidas: boolean;
  recibidas: boolean;
  metadata: boolean;
  ultimaEjecucion?: string;
}

export interface RegistroSync {
  id: string;
  despachoId: string;
  inicio: string;
  fin?: string;
  resultado: "ok" | "parcial" | "error" | "en_curso";
  detalle: string;
}

/* ---------- Fase 3: REP 2.0, CXC y CXP ---------- */

/** Desglose proporcional de impuestos de un documento relacionado del pago. */
export interface ImpuestoDR {
  base: number;
  impuesto: string; // 001 | 002 | 003
  tipoFactor: "Tasa" | "Exento";
  tasa?: number;
  importe?: number;
  esRetencion: boolean;
}

export interface DoctoPago {
  facturaId: string;
  uuid: string;
  serie?: string;
  folio?: string;
  parcialidad: number;
  saldoAnterior: number;
  pagado: number;
  saldoInsoluto: number;
  objetoImpDR: "01" | "02";
  impuestos: ImpuestoDR[];
}

export interface PagoRep {
  id: string;
  empresaId: string;
  clienteId: string;
  serie: string;
  folio: string;
  fechaPago: string; // fecha en que se recibió el pago
  formaPago: string;
  moneda: string;
  monto: number;
  doctos: DoctoPago[];
  estado: EstadoFactura;
  demo: boolean;
  uuid?: string;
  fechaTimbrado?: string;
  selloCFD?: string;
  selloSAT?: string;
  noCertificado?: string;
  noCertificadoSAT?: string;
  rfcProvCertif?: string;
  cadenaOriginal?: string;
  xmlPath?: string;
  errorMsg?: string;
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  creadoEl: string;
}

export interface CxpEstado {
  uuid: string;
  empresaId: string;
  estadoPago: "pendiente" | "programada" | "pagada";
  fechaProgramada?: string;
  nota?: string;
  actualizadoEl: string;
}

export interface ConfigSmtp {
  host: string;
  port: number;
  seguro: boolean; // TLS/SSL
  user: string;
  pass?: string;
  from: string;
  recordatoriosAuto: boolean;
}

export interface DbShape {
  emisores: Emisor[];
  clientes: Cliente[];
  productos: Producto[];
  facturas: Factura[];
  descargas: SolicitudDescarga[];
  config: AppConfig;
}
