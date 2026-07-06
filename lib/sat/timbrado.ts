import crypto from "crypto";
import type { ConfigPac, Emisor } from "../types";
import { insertarComplemento, escapeXml } from "./cfdi";
import { fechaCfdi } from "./importes";
import { decryptSecret } from "../secret";
import { bytesCertificado } from "./cert-bytes";

// Timbrado del CFDI. El timbrado real SOLO puede hacerlo un PAC autorizado por el
// SAT; este módulo implementa:
//   - "demo": simula el timbre (útil para probar el portal SIN validez fiscal)
//   - "sw":   SW Sapien / smarterweb (REST), compatible con su sandbox gratuito

export interface ResultadoTimbrado {
  xmlTimbrado: string;
  uuid: string;
  fechaTimbrado: string;
  selloSAT: string;
  noCertificadoSAT: string;
  rfcProvCertif: string;
  demo: boolean;
}

export interface ResultadoCancelacion {
  estatus: string;
  acuse?: string;
  demo: boolean;
}

export interface DatosCancelacion {
  uuid: string;
  motivo: string;
  folioSustitucion?: string;
  emisor: Emisor;
}

const NO_CERTIFICADO_SAT_DEMO = "30001000000500003416";
const RFC_PROV_CERTIF_DEMO = "SPR190613I52";

function extraerSello(xml: string): string {
  const m = xml.match(/<cfdi:Comprobante[^>]*\sSello="([^"]+)"/s);
  if (!m) throw new Error("El XML no contiene el atributo Sello.");
  return m[1];
}

export function construirTfdXml(tfd: {
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  selloCFD: string;
  noCertificadoSAT: string;
  selloSAT: string;
}): string {
  return (
    `<tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
    ` xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital` +
    ` http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"` +
    ` Version="1.1" UUID="${tfd.uuid}" FechaTimbrado="${tfd.fechaTimbrado}"` +
    ` RfcProvCertif="${tfd.rfcProvCertif}" SelloCFD="${escapeXml(tfd.selloCFD)}"` +
    ` NoCertificadoSAT="${tfd.noCertificadoSAT}" SelloSAT="${escapeXml(tfd.selloSAT)}"/>`
  );
}

/** Timbrado simulado: genera un TFD de práctica claramente marcado como demo. */
function timbrarDemo(xmlSellado: string): ResultadoTimbrado {
  const uuid = crypto.randomUUID().toUpperCase();
  const fechaTimbrado = fechaCfdi(new Date());
  const selloCFD = extraerSello(xmlSellado);
  const selloSAT = crypto.randomBytes(256).toString("base64");
  const tfdXml = construirTfdXml({
    uuid,
    fechaTimbrado,
    rfcProvCertif: RFC_PROV_CERTIF_DEMO,
    selloCFD,
    noCertificadoSAT: NO_CERTIFICADO_SAT_DEMO,
    selloSAT,
  });
  return {
    xmlTimbrado: insertarComplemento(xmlSellado, tfdXml),
    uuid,
    fechaTimbrado,
    selloSAT,
    noCertificadoSAT: NO_CERTIFICADO_SAT_DEMO,
    rfcProvCertif: RFC_PROV_CERTIF_DEMO,
    demo: true,
  };
}

async function tokenSw(config: ConfigPac): Promise<string> {
  if (config.swToken) return config.swToken;
  if (!config.swUser || !config.swPassword) {
    throw new Error("Configura el token o usuario/contraseña de SW Sapien en Configuración.");
  }
  const res = await fetch(`${config.swUrlServices}/security/authenticate`, {
    method: "POST",
    headers: { user: config.swUser, password: config.swPassword },
  });
  const json = (await res.json()) as { status?: string; data?: { token?: string }; message?: string };
  if (!res.ok || json.status !== "success" || !json.data?.token) {
    throw new Error(`No se pudo autenticar con SW: ${json.message ?? res.statusText}`);
  }
  return json.data.token;
}

function extraerTfd(xmlTimbrado: string): Omit<ResultadoTimbrado, "xmlTimbrado" | "demo"> {
  const tfd = xmlTimbrado.match(/<tfd:TimbreFiscalDigital[^>]*>/s)?.[0];
  if (!tfd) throw new Error("El PAC no devolvió el Timbre Fiscal Digital en el XML.");
  const attr = (name: string) => tfd.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "";
  return {
    uuid: attr("UUID"),
    fechaTimbrado: attr("FechaTimbrado"),
    selloSAT: attr("SelloSAT"),
    noCertificadoSAT: attr("NoCertificadoSAT"),
    rfcProvCertif: attr("RfcProvCertif"),
  };
}

/** Timbrado real con SW Sapien (services.test.sw.com.mx para pruebas). */
async function timbrarSw(xmlSellado: string, config: ConfigPac): Promise<ResultadoTimbrado> {
  const token = await tokenSw(config);
  const form = new FormData();
  form.append("xml", new Blob([xmlSellado], { type: "text/xml" }), "cfdi.xml");
  const res = await fetch(`${config.swUrlServices}/cfdi33/stamp/v4`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json()) as {
    status?: string;
    data?: { cfdi?: string };
    message?: string;
    messageDetail?: string;
  };
  if (!res.ok || json.status !== "success" || !json.data?.cfdi) {
    const detalle = [json.message, json.messageDetail].filter(Boolean).join(" — ");
    throw new Error(`El PAC rechazó el timbrado: ${detalle || res.statusText}`);
  }
  return { xmlTimbrado: json.data.cfdi, ...extraerTfd(json.data.cfdi), demo: false };
}

export async function timbrar(xmlSellado: string, config: ConfigPac): Promise<ResultadoTimbrado> {
  if (config.modo === "sw") return timbrarSw(xmlSellado, config);
  return timbrarDemo(xmlSellado);
}

/** Cancelación ante el SAT (vía PAC con el CSD del emisor, o simulada en demo). */
export async function cancelar(
  datos: DatosCancelacion,
  config: ConfigPac,
): Promise<ResultadoCancelacion> {
  if (config.modo === "demo") {
    return { estatus: "Cancelado (simulación demo, sin efectos ante el SAT)", demo: true };
  }
  const { emisor } = datos;
  if (!emisor.csd) throw new Error("El emisor no tiene CSD cargado para firmar la cancelación.");
  const token = await tokenSw(config);
  const { cer, key } = bytesCertificado(emisor, "csd");
  const body: Record<string, string> = {
    uuid: datos.uuid,
    motivo: datos.motivo,
    rfc: emisor.rfc,
    b64Cer: cer.toString("base64"),
    b64Key: key.toString("base64"),
    password: decryptSecret(emisor.csd.passwordEnc),
  };
  if (datos.motivo === "01") {
    if (!datos.folioSustitucion) {
      throw new Error("El motivo 01 requiere el folio fiscal (UUID) del CFDI que sustituye.");
    }
    body.folioSustitucion = datos.folioSustitucion;
  }
  const res = await fetch(`${config.swUrlServices}/cfdi33/cancel/csd`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    status?: string;
    data?: { acuse?: string; uuid?: Record<string, string> };
    message?: string;
    messageDetail?: string;
  };
  if (!res.ok || json.status !== "success") {
    const detalle = [json.message, json.messageDetail].filter(Boolean).join(" — ");
    throw new Error(`El PAC rechazó la cancelación: ${detalle || res.statusText}`);
  }
  const estatusUuid = json.data?.uuid ? Object.values(json.data.uuid)[0] : undefined;
  return {
    estatus: estatusUuid ? `Solicitud aceptada (código ${estatusUuid})` : "Solicitud de cancelación aceptada",
    acuse: json.data?.acuse,
    demo: false,
  };
}
