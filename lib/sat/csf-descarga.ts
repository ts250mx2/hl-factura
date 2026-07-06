import forge from "node-forge";
import type { Emisor } from "../types";
import { decryptSecret } from "../secret";
import { parseLlavePrivada } from "./certificados";
import { bytesCertificado } from "./cert-bytes";

// BETA — Descarga de la Constancia de Situación Fiscal autenticando en el portal
// del SAT con la e.firma (FIEL). El SAT no expone un API oficial para la CSF, así
// que se automatiza el login: se firma el reto `tokenuuid|rfc|numeroSerie` con la
// llave privada (RSA-SHA1) y se arma el token igual que el JavaScript del SAT:
//   token = base64( base64(co) + "#" + base64(firma) )
// El endpoint final del PDF puede variar; por eso se devuelven los pasos (pasos[])
// para poder afinar el flujo con respuestas reales.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CSF_ENTRY = "https://rfc.siat.sat.gob.mx/PTSC/RFC/menu";

export interface PasoDiag {
  paso: string;
  url?: string;
  status?: number;
  detalle?: string;
}

export interface ResultadoCsf {
  ok: boolean;
  pdf?: Buffer;
  rfc?: string;
  pasos: PasoDiag[];
  error?: string;
}

type Jar = Map<string, Map<string, string>>;

function hostDe(u: string): string {
  return new URL(u).host;
}

function guardarCookies(jar: Jar, u: string, res: Response) {
  const host = hostDe(u);
  const getter = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const lista = typeof getter === "function" ? getter.call(res.headers) : [];
  const m = jar.get(host) ?? new Map<string, string>();
  for (const c of lista) {
    const par = c.split(";")[0];
    const i = par.indexOf("=");
    if (i > 0) m.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  jar.set(host, m);
}

function headerCookies(jar: Jar, u: string): string {
  const m = jar.get(hostDe(u));
  return m ? [...m.entries()].map(([k, v]) => `${k}=${v}`).join("; ") : "";
}

async function hop(
  jar: Jar,
  url: string,
  init: RequestInit,
  pasos: PasoDiag[],
  etiqueta: string,
): Promise<{ res: Response; body: ArrayBuffer; url: string }> {
  let actual = url;
  let curInit: RequestInit = init;
  for (let i = 0; i < 12; i++) {
    const cookie = headerCookies(jar, actual);
    const res = await fetch(actual, {
      ...curInit,
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        "Accept-Language": "es-MX,es;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(curInit.headers || {}),
      },
    });
    guardarCookies(jar, actual, res);
    const loc = res.headers.get("location");
    pasos.push({ paso: `${etiqueta}${i ? ` (${i})` : ""}`, url: actual, status: res.status, detalle: loc || res.headers.get("content-type") || "" });
    if (res.status >= 300 && res.status < 400 && loc) {
      actual = new URL(loc, actual).toString();
      curInit = { method: "GET" };
      continue;
    }
    const body = await res.arrayBuffer();
    return { res, body, url: actual };
  }
  throw new Error("Demasiadas redirecciones");
}

function attr(html: string, id: string): string {
  const re = new RegExp(`id="${id}"[^>]*\\bvalue="([^"]*)"`, "i");
  const re2 = new RegExp(`\\bname="${id}"[^>]*\\bvalue="([^"]*)"`, "i");
  return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
}

function accionForm(html: string, formId: string): string | null {
  const re = new RegExp(`<form[^>]*id="${formId}"[^>]*action="([^"]*)"`, "i");
  const re2 = new RegExp(`<form[^>]*action="([^"]*)"[^>]*id="${formId}"`, "i");
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function enlaceEfirma(html: string, base: string): string | null {
  // Enlaces/contratos del NIDP que llevan al certificado de e.firma
  const cands = [...html.matchAll(/(?:href|action|location\.href\s*=\s*)["']([^"']*(?:nidp\/app\/login\?id=[^"']*|main\.jsp\?id=[^"']*fiel[^"']*|Certi[^"']*|efirma[^"']*))["']/gi)].map((m) => m[1]);
  const pref = cands.find((c) => /fiel|efirma|e\.firma|x509|Certi/i.test(c)) ?? cands[0];
  return pref ? new URL(pref, base).toString() : null;
}

/** Construye el token firmado igual que el applet JS del SAT (RSA-SHA1). */
function construirToken(fiel: NonNullable<Emisor["fiel"]>, tokenuuid: string, keyBuf: Buffer): string {
  const co = `${tokenuuid}|${fiel.rfc}|${fiel.noCertificado}`;
  const priv = parseLlavePrivada(keyBuf, decryptSecret(fiel.passwordEnc));
  const md = forge.md.sha1.create();
  md.update(co, "utf8");
  const firma = forge.util.encode64(priv.sign(md));
  const innerB64 = Buffer.from(co, "utf8").toString("base64");
  return Buffer.from(`${innerB64}#${firma}`, "utf8").toString("base64");
}

function entradaValida(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.host.endsWith(".sat.gob.mx") ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function descargarCsfConFiel(emisor: Emisor, entrada?: string): Promise<ResultadoCsf> {
  const pasos: PasoDiag[] = [];
  try {
    const fiel = emisor.fiel;
    if (!fiel) return { ok: false, pasos, error: "Esta empresa no tiene FIEL (e.firma) cargada." };

    const jar: Jar = new Map();
    const entry = entradaValida(entrada) ?? CSF_ENTRY;

    // 1) Entrar a la app y seguir hasta la página de autenticación.
    let salto = await hop(jar, entry, { method: "GET" }, pasos, "Entrada");
    let html = Buffer.from(salto.body).toString("utf8");

    // 2) Si no es el formulario de e.firma, seguir el enlace de e.firma.
    if (!/id="tokenuuid"/i.test(html)) {
      const link = enlaceEfirma(html, salto.url);
      if (link) {
        salto = await hop(jar, link, { method: "GET" }, pasos, "e.firma");
        html = Buffer.from(salto.body).toString("utf8");
      }
    }
    if (!/id="tokenuuid"/i.test(html)) {
      return { ok: false, pasos, error: "No se llegó a la página de e.firma del SAT (pudo cambiar el portal). Revisa los pasos." };
    }

    // 3) Extraer los campos del reto.
    const tokenuuid = attr(html, "tokenuuid");
    const guid = attr(html, "guid") || tokenuuid;
    const urlApplet = attr(html, "urlApplet") || salto.url;
    const accion = accionForm(html, "certform") || salto.url;
    const accionUrl = new URL(accion, salto.url).toString();
    if (!tokenuuid) return { ok: false, pasos, error: "El SAT no entregó el reto (tokenuuid)." };

    // 4) Firmar el reto con la FIEL (desde la base de datos) y armar el token.
    const { key } = bytesCertificado(emisor, "fiel");
    const token = construirToken(fiel, tokenuuid, key);

    // 5) Enviar la autenticación.
    const cuerpo = new URLSearchParams({
      token,
      credentialsRequired: "CERT",
      guid,
      ks: "null",
      seeder: "",
      arc: "",
      tan: "",
      placer: "",
      secuence: "",
      urlApplet,
      fert: "",
    });
    salto = await hop(
      jar,
      accionUrl,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpo.toString() },
      pasos,
      "Autenticación",
    );

    // 6) Evaluar el resultado.
    const ct = salto.res.headers.get("content-type") || "";
    const buf = Buffer.from(salto.body);
    if (ct.includes("application/pdf") || (buf.length > 4 && buf.subarray(0, 5).toString("latin1") === "%PDF-")) {
      return { ok: true, pdf: buf, rfc: fiel.rfc, pasos };
    }
    const finalHtml = buf.toString("utf8");
    if (/Certificado Revocado|Certificado Caduco|no est[aá] vigente|revocada|Certificado Inv[aá]lid/i.test(finalHtml)) {
      return { ok: false, pasos, error: "El SAT rechazó la e.firma (revocada, no vigente o inválida)." };
    }
    return {
      ok: false,
      pasos,
      error:
        "La autenticación se envió al SAT, pero la respuesta no fue el PDF de la CSF (probablemente falta el paso final de generación/descarga dentro del portal). Comparte los pasos para afinar el endpoint.",
    };
  } catch (e) {
    return { ok: false, pasos, error: e instanceof Error ? e.message : String(e) };
  }
}
