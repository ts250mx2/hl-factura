import https from "https";
import forge from "node-forge";
import type { Emisor } from "../types";
import { decryptSecret } from "../secret";
import { parseLlavePrivada } from "./certificados";
import { bytesCertificado } from "./cert-bytes";

// Descarga de la Constancia de Situación Fiscal (CSF) autenticando en el portal
// del SAT con la e.firma (FIEL). El SAT no expone un API oficial; se replica el
// flujo real del navegador (verificado por ingeniería inversa):
//   1. Lanzador  wwwmat.sat.gob.mx/app/seg/faces/pages/lanzador.jsf?...&tipoLogeo=f
//   2. Login     login.siat.sat.gob.mx, contrato fiel_Aviso (FIEL contribuyente)
//   3. certform  se firma el reto tokenuuid|rfc|numeroSerie con RSA-SHA1 y se
//                arma token = base64( base64(co) + "#" + base64(firma) ), igual
//                que el JavaScript del SAT (sjcl/jsrsasign signString "sha1").
//   4. Regreso   SAML a wwwmat .../accesoF → operacion/53027 (genera el PDF).
// Notas de implementación:
// - Entre pasos el portal usa formularios auto-enviados por JavaScript
//   (document.forms[0].submit()), que aquí se reenvían manualmente.
// - La cabecera Accept: text/html es imprescindible (si no, el NIDP responde vacío).
// - El TLS del SAT usa una llave Diffie-Hellman débil que Node rechaza por
//   defecto; se baja el nivel de seguridad de OpenSSL solo para estas peticiones.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CSF_ENTRY =
  "https://wwwmat.sat.gob.mx/app/seg/faces/pages/lanzador.jsf?url=/operacion/53027/genera-tu-constancia-de-situacion-fiscal.&tipoLogeo=f&target=principal&hostServer=https://wwwmat.sat.gob.mx";

// Ruta de generación/descarga del PDF una vez autenticada la e.firma, replicada
// de python-satcfdi (SATPortalConstancia.generar_constancia): la CSF NO se baja
// por wwwmat/operacion/53027, sino por el portal de trámites de rfcampc.siat.
const RFCAMPC = "https://rfcampc.siat.sat.gob.mx";
const SESSION_BROKER = `${RFCAMPC}/app/seg/SessionBroker?url=/PTSC/IdcSiat/autc/ReimpresionTramite/ConsultaTramite.jsf&parametro=c&idSessionBit=&idSessionBit=null`;
const SAML_SSO = "https://login.siat.sat.gob.mx/nidp/saml2/sso";
const ACS_POST = `${RFCAMPC}/saml2/sp/acs/post`;
const CONSULTA_TRAMITE = `${RFCAMPC}/PTSC/IdcSiat/autc/ReimpresionTramite/ConsultaTramite.jsf`;
const GENERA_CONSTANCIA = `${RFCAMPC}/PTSC/IdcSiat/IdcGeneraConstancia.jsf`;

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

interface Resp {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** Petición HTTPS bajando el nivel de OpenSSL (el SAT usa DH débil). */
function peticion(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opciones = {
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method,
      headers,
      ciphers: "DEFAULT@SECLEVEL=0",
      minDHSize: 512,
    } as https.RequestOptions;
    const req = https.request(opciones, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.setTimeout(45_000, () => req.destroy(new Error("Tiempo de espera agotado con el portal del SAT")));
    if (body) req.write(body);
    req.end();
  });
}

function hostDe(u: string): string {
  return new URL(u).host;
}

function guardarCookies(jar: Jar, u: string, lista?: string[]) {
  if (!lista || !lista.length) return;
  const host = hostDe(u);
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

interface Salto {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  url: string;
}

interface Init {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  referer?: string;
}

/** Hace una petición siguiendo redirecciones HTTP (no ejecuta JavaScript). */
async function hop(jar: Jar, url: string, init: Init, pasos: PasoDiag[], etiqueta: string): Promise<Salto> {
  let actual = url;
  let method = init.method || "GET";
  let body = init.body;
  let referer = init.referer;
  let extra = init.headers || {};
  for (let i = 0; i < 12; i++) {
    const cookie = headerCookies(jar, actual);
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
      "Accept-Language": "es-MX,es;q=0.9",
      "Upgrade-Insecure-Requests": "1",
      ...(referer ? { Referer: referer } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    };
    if (body && method !== "GET") headers["Content-Length"] = String(Buffer.byteLength(body));
    const res = await peticion(actual, method, headers, method === "GET" ? undefined : body);
    guardarCookies(jar, actual, res.headers["set-cookie"] as string[] | undefined);
    const loc = (res.headers["location"] as string) || "";
    pasos.push({ paso: `${etiqueta}${i ? ` (${i})` : ""}`, url: actual, status: res.status, detalle: loc || (res.headers["content-type"] as string) || "" });
    if (res.status >= 300 && res.status < 400 && loc) {
      actual = new URL(loc, actual).toString();
      method = "GET";
      body = undefined;
      referer = actual;
      extra = {};
      continue;
    }
    return { status: res.status, headers: res.headers, body: res.body, url: actual };
  }
  throw new Error("Demasiadas redirecciones");
}

const texto = (s: Salto) => s.body.toString("utf8");

function esPdf(s: Salto): boolean {
  const ct = (s.headers["content-type"] as string) || "";
  return ct.includes("application/pdf") || (s.body.length > 4 && s.body.subarray(0, 5).toString("latin1") === "%PDF-");
}

/** Página que se auto-envía por JavaScript (document.forms[0].submit()). */
function esAutoSubmit(html: string): boolean {
  return /document\.forms\[0\]\.submit\(\)/i.test(html) && /<form/i.test(html);
}

interface Formulario {
  action: string;
  method: string;
  inputs: Record<string, string>;
}

function attrDe(tag: string, nombre: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${nombre}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : undefined;
}

/** Parsea un bloque <form> (tag de apertura + cuerpo) a su modelo. */
function parseBloque(abre: string, cuerpo: string): Formulario {
  const inputs: Record<string, string> = {};
  for (const inp of cuerpo.matchAll(/<input\b[^>]*>/gi)) {
    const tag = inp[0];
    const name = attrDe(tag, "name");
    if (!name) continue;
    const tipo = (attrDe(tag, "type") || "text").toLowerCase();
    if (tipo === "submit" || tipo === "button" || tipo === "reset") continue;
    inputs[name] = attrDe(tag, "value") ?? "";
  }
  return { action: attrDe(abre, "action") || "", method: (attrDe(abre, "method") || "post").toLowerCase(), inputs };
}

/** Recorre todos los <form>…</form> de la página. */
function* formularios(html: string): Generator<{ abre: string; cuerpo: string }> {
  for (const m of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)) {
    yield { abre: m[0].slice(0, m[0].indexOf(">") + 1), cuerpo: m[1] };
  }
}

/** Extrae el primer <form> de la página con sus campos (name→value). */
function parseForm(html: string): Formulario | null {
  for (const f of formularios(html)) return parseBloque(f.abre, f.cuerpo);
  return null;
}

/** Extrae el <form> que contiene un campo dado (por name o id). La página del
 *  certform trae DOS formularios (el de la plantilla gob.mx y el real
 *  id="certform"); hay que elegir el que tiene el input `token`. */
function parseFormConCampo(html: string, campo: string): Formulario | null {
  const re = new RegExp(`(?:name|id)\\s*=\\s*"${campo}"`, "i");
  for (const f of formularios(html)) {
    if (re.test(f.cuerpo) || re.test(f.abre)) return parseBloque(f.abre, f.cuerpo);
  }
  return null;
}

async function enviarForm(jar: Jar, form: Formulario, base: string, pasos: PasoDiag[], etiqueta: string): Promise<Salto> {
  const actionUrl = new URL(form.action || base, base).toString();
  if (form.method === "get") {
    const u = new URL(actionUrl);
    for (const [k, v] of Object.entries(form.inputs)) u.searchParams.set(k, v);
    return hop(jar, u.toString(), { method: "GET", referer: base }, pasos, etiqueta);
  }
  const body = new URLSearchParams(form.inputs).toString();
  // El NIDP/NAM valida Origin en el POST de credenciales (protección CSRF); un
  // navegador real siempre lo envía same-origin, así que lo replicamos.
  const origin = new URL(actionUrl).origin;
  return hop(jar, actionUrl, { method: "POST", referer: base, headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin }, body }, pasos, etiqueta);
}

/** Reenvía en cadena los formularios auto-enviados hasta el PDF, el certform o
 *  una página estable (sin auto-submit). */
async function seguirAutoSubmit(jar: Jar, s: Salto, pasos: PasoDiag[], etiqueta: string): Promise<Salto> {
  for (let i = 0; i < 10; i++) {
    if (esPdf(s)) return s;
    const html = texto(s);
    if (/id="tokenuuid"/i.test(html)) return s; // certform
    if (!esAutoSubmit(html)) return s;
    const form = parseForm(html);
    if (!form) return s;
    s = await enviarForm(jar, form, s.url, pasos, etiqueta);
  }
  return s;
}

const accionDe = (f: Formulario, base: string) => new URL(f.action || base, base).toString();

/** Genera y descarga el PDF de la CSF por el portal de trámites de rfcampc.siat,
 *  replicando python-satcfdi (SATPortalConstancia.generar_constancia). Requiere
 *  que la e.firma ya esté autenticada en login.siat (cookies en el `jar`):
 *    1. SessionBroker de rfcampc → puede disparar un round-trip SAML.
 *    2. POST del <form> SAML a login.siat/nidp/saml2/sso → respuesta SAML.
 *    3. POST de la aserción a rfcampc/saml2/sp/acs/post → sesión en rfcampc.
 *    4. POST ajax de JSF a ConsultaTramite.jsf (dispara la reimpresión).
 *    5. GET a IdcGeneraConstancia.jsf → el PDF. */
async function generarConstanciaRfcampc(jar: Jar, pasos: PasoDiag[]): Promise<Salto> {
  // 1) Entrar al trámite; hop sigue las redirecciones HTTP hasta una página estable.
  let s = await hop(jar, SESSION_BROKER, { method: "GET" }, pasos, "Bóveda");

  // 2-3) Round-trip SAML si el broker lo pide (form a nidp/saml2/sso, luego a acs/post).
  let form = parseForm(texto(s));
  if (form && accionDe(form, s.url).startsWith(SAML_SSO)) {
    s = await enviarForm(jar, form, s.url, pasos, "SAML");
    form = parseForm(texto(s));
    if (form && accionDe(form, s.url).startsWith(ACS_POST)) {
      s = await enviarForm(jar, form, s.url, pasos, "SAML (ACS)");
    }
  }

  // 4) Disparar la reimpresión con el POST ajax de JSF (necesita el ViewState).
  const consulta = parseFormConCampo(texto(s), "javax.faces.ViewState") || parseForm(texto(s));
  const viewState = consulta?.inputs["javax.faces.ViewState"];
  if (viewState) {
    const ajax: Formulario = {
      action: CONSULTA_TRAMITE,
      method: "post",
      inputs: {
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": "formReimpAcuse:j_idt50",
        "javax.faces.partial.execute": "@all",
        "formReimpAcuse:j_idt50": "formReimpAcuse:j_idt50",
        formReimpAcuse: "formReimpAcuse",
        "formReimpAcuse:tipoTramite_input": "0",
        "formReimpAcuse:tipoTramite_focus": "",
        "formReimpAcuse:fechaInicio_input:": "",
        "formReimpAcuse:fechaFin_input": "",
        "formReimpAcuse:folio": "",
        "javax.faces.ViewState": viewState,
      },
    };
    await enviarForm(jar, ajax, s.url, pasos, "Reimpresión");
  } else {
    pasos.push({ paso: "Reimpresión", detalle: "No se encontró javax.faces.ViewState en ConsultaTramite (el portal pudo cambiar)." });
  }

  // 5) Descargar el PDF ya generado.
  return hop(jar, GENERA_CONSTANCIA, { method: "GET" }, pasos, "Constancia");
}

/** Firma el reto con la FIEL y arma el token igual que el applet JS del SAT.
 *  Formato (verificado contra python-satcfdi generate_token/verify_token):
 *    token = base64( base64(co) + "#" + base64(base64(firmaCruda)) )
 *  OJO: el segmento de firma lleva base64 DOBLE. El SAT hace dos b64decode sobre
 *  él antes de validar; con una sola pasada la firma no valida y el NIDP da 500. */
function construirToken(fiel: NonNullable<Emisor["fiel"]>, reto: string, keyBuf: Buffer): string {
  const co = `${reto}|${fiel.rfc}|${fiel.noCertificado}`;
  const priv = parseLlavePrivada(keyBuf, decryptSecret(fiel.passwordEnc));
  const md = forge.md.sha1.create();
  md.update(co, "utf8");
  const firmaB64 = forge.util.encode64(priv.sign(md)); // base64(firmaCruda)
  const firmaDoble = Buffer.from(firmaB64, "utf8").toString("base64"); // base64(base64(firmaCruda))
  const innerB64 = Buffer.from(co, "utf8").toString("base64");
  return Buffer.from(`${innerB64}#${firmaDoble}`, "utf8").toString("base64");
}

/** getNotAfter() del cert tal como lo hace el JS del SAT: el valor crudo de la
 *  fecha notAfter (UTCTime "YYMMDDHHMMSSZ"). El certform lo manda en `fert`. */
function getNotAfter(cerBuf: Buffer): string {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(cerBuf.toString("binary")));
  const tbs = (asn1.value as forge.asn1.Asn1[])[0];
  const validity = (tbs.value as forge.asn1.Asn1[]).find(
    (n) =>
      n.type === forge.asn1.Type.SEQUENCE &&
      Array.isArray(n.value) &&
      (n.value as forge.asn1.Asn1[]).length === 2 &&
      (n.value as forge.asn1.Asn1[]).every(
        (x) => x.type === forge.asn1.Type.UTCTIME || x.type === forge.asn1.Type.GENERALIZEDTIME,
      ),
  );
  const notAfter = validity ? (validity.value as forge.asn1.Asn1[])[1] : undefined;
  const raw = notAfter ? String(notAfter.value) : "";
  // El SAT espera YYMMDDHHMMSSZ (13 caracteres, sin siglo). El UTCTime de los
  // certs <2050 ya viene así; el GeneralizedTime (>=2050) trae el siglo, así que
  // recortamos a los últimos 13 para dejar siempre el formato esperado.
  return raw.length > 13 ? raw.slice(-13) : raw;
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

    // 1) Entrar al lanzador y seguir hasta la página de e.firma (certform).
    let s = await hop(jar, entry, { method: "GET" }, pasos, "Entrada");
    s = await seguirAutoSubmit(jar, s, pasos, "SSO");
    let html = texto(s);

    if (esPdf(s)) return { ok: true, pdf: s.body, rfc: fiel.rfc, pasos };
    if (!/id="tokenuuid"/i.test(html)) {
      return { ok: false, pasos, error: "No se llegó a la página de e.firma del SAT (el portal pudo cambiar). Revisa los pasos." };
    }

    // 2) Extraer el reto y los campos ocultos del certform.
    const tokenuuid = attrDe(html.match(/id="tokenuuid"[^>]*>/i)?.[0] || "", "value") || "";
    if (!tokenuuid) return { ok: false, pasos, error: "El SAT no entregó el reto (tokenuuid)." };
    // El JS del SAT firma el value del input name="guid" (el mismo <input> que
    // trae id="tokenuuid", con idéntico value). Se prefiere `guid` por fidelidad;
    // se registra la comparación para detectar si el SAT los llegara a separar.
    const guidVal = attrDe(html.match(/name="guid"[^>]*>/i)?.[0] || "", "value") || "";
    const reto = guidVal || tokenuuid;
    pasos.push({
      paso: "Reto",
      detalle: `tokenuuid=${tokenuuid.slice(0, 12)}… · guid=${(guidVal || "(sin campo)").slice(0, 12)}… · coinciden=${guidVal === tokenuuid}`,
    });
    // La página trae DOS <form>; hay que tomar el que contiene el campo `token`
    // (id="certform"), no el primero (plantilla gob.mx).
    const certform = parseFormConCampo(html, "token") || parseForm(html);
    if (!certform) return { ok: false, pasos, error: "No se encontró el formulario de e.firma." };

    // 3) Firmar el reto con la FIEL (desde la base de datos) y colocar el token.
    //    El certform también manda en `fert` la fecha de expiración del cert
    //    (getNotAfter), que el JS del SAT llena al cargar el .cer.
    const { cer, key } = bytesCertificado(emisor, "fiel");
    pasos.push({
      paso: "FIEL",
      detalle: `tipo ${fiel.tipo} · RFC ${fiel.rfc} · noCert ${fiel.noCertificado} · vence ${(fiel.validoHasta || "").slice(0, 10)} · vigente ${fiel.vigente}`,
    });
    certform.inputs.token = construirToken(fiel, reto, key);
    certform.inputs.fert = getNotAfter(cer);

    // 4) Enviar la autenticación (el certform postea a su propia URL). El NIDP
    //    responde con una página que finaliza la sesión por window.location; no
    //    hace falta seguirla: la cookie de sesión ya quedó fijada por este POST.
    s = await enviarForm(jar, certform, s.url, pasos, "Autenticación");
    s = await seguirAutoSubmit(jar, s, pasos, "Autenticación");

    if (esPdf(s)) return { ok: true, pdf: s.body, rfc: fiel.rfc, pasos };

    // Diagnóstico de la autenticación. El certform del SAT trae SIEMPRE los textos
    // "revocada"/"no vigente" en su JS (mensajes predefinidos); el error REAL lo
    // inyecta el servidor en `var error = '...'` (vacío = sin error). Si el
    // certform reaparece, la firma no fue aceptada.
    html = texto(s);
    const certReaparece = /id="tokenuuid"/i.test(html);
    const errorSat = (html.match(/var\s+error\s*=\s*'([^']*)'/i)?.[1] || "").trim();
    const cuerpo = html.replace(/\s+/g, " ").trim().slice(0, 400);
    const setCk = (s.headers["set-cookie"] as string[] | undefined)?.length || 0;
    pasos.push({
      paso: "Autenticación (resultado)",
      status: s.status,
      detalle: `${(s.headers["content-type"] as string) || ""} · ${s.body.length} bytes · certform=${certReaparece} · set-cookie=${setCk} · error="${errorSat || "(vacío)"}" · cuerpo="${cuerpo}"`,
    });

    if (errorSat) {
      return { ok: false, pasos, error: `El SAT rechazó la e.firma: ${errorSat}.` };
    }
    if (certReaparece || s.status >= 400) {
      return {
        ok: false,
        pasos,
        error:
          "El SAT no aceptó la autenticación con la FIEL (no reconoció la firma o el certificado). Verifica que el .cer y .key subidos sean la e.firma (no un CSD) vigente de este RFC.",
      };
    }

    // 5) Autenticado: generar y descargar el PDF por el portal de trámites (rfcampc).
    s = await generarConstanciaRfcampc(jar, pasos);
    if (esPdf(s)) return { ok: true, pdf: s.body, rfc: fiel.rfc, pasos };

    const htmlFinal = texto(s).replace(/\s+/g, " ").trim().slice(0, 400);
    pasos.push({
      paso: "Constancia (resultado)",
      status: s.status,
      detalle: `${(s.headers["content-type"] as string) || ""} · ${s.body.length} bytes · cuerpo="${htmlFinal}"`,
    });
    return {
      ok: false,
      pasos,
      error:
        "La autenticación con la FIEL fue aceptada, pero el portal de trámites no devolvió el PDF de la CSF. Revisa los pasos (Bóveda/SAML/Reimpresión/Constancia).",
    };
  } catch (e) {
    return { ok: false, pasos, error: e instanceof Error ? e.message : String(e) };
  }
}
