import crypto from "crypto";
import type { Emisor, OpinionCumplimiento } from "../types";
import { extraerTextoPdf } from "./constancia";
import {
  entradaValida,
  enviarForm,
  esPdf,
  firmarCertform,
  hop,
  parseForm,
  texto,
  traducirErrorCsf,
  type Jar,
  type PasoDiag,
} from "./csf-descarga";

// Descarga de la Opinión del Cumplimiento de obligaciones fiscales (Art. 32-D
// CFF) con la e.firma. A diferencia de la CSF (login.siat + SAML/SessionBroker),
// este trámite migró al stack "cloud" del SAT y su flujo se verificó leyendo el
// código fuente de python-satcfdi (SATPortalOpinionCumplimiento) y phpcfdi:
//   1. GET  ptsc32d.clouda.sat.gob.mx/?/reporteOpinion32DContribuyente (302→login CIEC)
//   2. Se toma el <form> del login y se cambia id=ciec → id=fiel en su action.
//   3. certform: MISMA firma de e.firma que la CSF (firmarCertform, token+fert).
//   4. Se sigue el redirect JS (location.href=…) a la URL de autorización OAuth.
//   5. Se reenvían los <form> de auto-submit (OAuth form_post) hasta agotarlos.
//   6. POST JSON a RespuestaCompleta/ObtenerRespuestaCompletaPdf → el PDF viene
//      en el campo ContenidoBase64 (base64). El OAuth/PKCE lo resuelve el propio
//      backend del SAT con las cookies; el cliente solo transporta la sesión.

const OPINION_HOST = "https://ptsc32d.clouda.sat.gob.mx";
const OPINION_ENTRY = `${OPINION_HOST}/?/reporteOpinion32DContribuyente`;
const OPINION_PDF = `${OPINION_HOST}/RespuestaCompleta/ObtenerRespuestaCompletaPdf`;
// IdP del stack cloud (distinto al login.siat de la CSF). No se hardcodea el id
// de contrato: se parte del action que emite el portal y solo se hace el swap.
const NIDP_LOGIN = "https://loginda.siat.sat.gob.mx/nidp/app/login";

export interface ResultadoOpinion {
  ok: boolean;
  pdf?: Buffer;
  sentido?: OpinionCumplimiento["sentido"];
  folio?: string;
  pasos: PasoDiag[];
  error?: string;
}

/** Sentido de la opinión a partir del texto del PDF. El documento oficial trae
 *  la opinión "en sentido POSITIVO/NEGATIVO"; también existe el caso de un
 *  contribuyente inscrito sin obligaciones. Se prioriza la mención cercana a
 *  "sentido"/"opinión" para no confundirse con texto suelto del pie. */
export function sentidoDeTexto(t: string): OpinionCumplimiento["sentido"] {
  const plano = t.normalize("NFC").toUpperCase().replace(/\s+/g, " ");
  const cerca = plano.match(/(?:SENTIDO|OPINI[OÓ]N)[^A-Z]{0,40}?(POSITIV|NEGATIV)/);
  if (cerca) return cerca[1] === "POSITIV" ? "positiva" : "negativa";
  if (/SIN OBLIGACIONES|NO INSCRITO/.test(plano)) return "sin_obligaciones";
  const pos = /POSITIV[OA]/.test(plano);
  const neg = /NEGATIV[OA]/.test(plano);
  if (pos && !neg) return "positiva";
  if (neg && !pos) return "negativa";
  return "desconocido";
}

/** Folio de la opinión, si el PDF lo trae ("Folio: ..."). */
function folioDeTexto(t: string): string | undefined {
  const m = t.normalize("NFC").match(/Folio\s*:?\s*([A-Z0-9-]{6,40})/i);
  return m ? m[1] : undefined;
}

export async function descargarOpinionConFiel(emisor: Emisor, entrada?: string): Promise<ResultadoOpinion> {
  const pasos: PasoDiag[] = [];
  try {
    const fiel = emisor.fiel;
    if (!fiel) return { ok: false, pasos, error: "Esta empresa no tiene FIEL (e.firma) cargada." };

    const jar: Jar = new Map();
    const entry = entradaValida(entrada) ?? OPINION_ENTRY;

    // 1) Entrar al portal de la opinión; cae en el login (CIEC por defecto).
    let s = await hop(jar, entry, { method: "GET" }, pasos, "Entrada");

    // 2) Forzar el login con e.firma: en el <form> del login, cambiar id=ciec por
    //    id=fiel en su action y reenviarlo.
    const login = parseForm(texto(s));
    const loginAction = login ? new URL(login.action || s.url, s.url).toString() : "";
    if (login && loginAction.startsWith(NIDP_LOGIN)) {
      login.action = loginAction.replace("id=ciec", "id=fiel");
      pasos.push({ paso: "Login e.firma", detalle: `swap id=ciec→id=fiel · ${login.action.includes("id=fiel") ? "aplicado" : "SIN cambio (revisar)"}` });
      s = await enviarForm(jar, login, s.url, pasos, "Login e.firma");
    } else {
      pasos.push({ paso: "Login e.firma", detalle: `No se encontró el form de login del NIDP (action=${loginAction || "(sin form)"})` });
    }

    // 3) certform: firmar con la FIEL (misma pieza que la CSF).
    const firma = firmarCertform(emisor, texto(s), pasos);
    if (!firma.ok) return { ok: false, pasos, error: firma.error };
    s = await enviarForm(jar, firma.form, s.url, pasos, "Autenticación");

    // 4) Seguir el redirect por JavaScript (location.href = URL de autorización).
    const loc = texto(s).match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
    if (loc) {
      s = await hop(jar, new URL(loc[1], s.url).toString(), { method: "GET", referer: s.url }, pasos, "Autorización");
    }

    // 5) Reenviar los formularios de auto-submit del baile OAuth (form_post) hasta
    //    que ya no haya ninguno; la sesión la sostienen solo las cookies.
    for (let i = 0; i < 10; i++) {
      const f = parseForm(texto(s));
      if (!f) break;
      s = await enviarForm(jar, f, s.url, pasos, `Redirección ${i + 1}`);
      if (esPdf(s)) break;
    }

    // 6) Pedir el PDF de la opinión (JSON con el PDF en base64).
    const rfc = fiel.rfc;
    const payload = JSON.stringify({
      canal: "G",
      curp: "",
      idCorrelacion: crypto.randomUUID(),
      ip: "127.0.0.1",
      rfc,
      tipoConsulta: "COMPLETA",
      tipoReporte: "32D",
      usuario: rfc,
      rfcCorto: rfc,
    });
    const pdfRes = await hop(
      jar,
      OPINION_PDF,
      {
        method: "POST",
        body: payload,
        referer: `${OPINION_HOST}/`,
        headers: { "Content-Type": "application/json", Accept: "application/json", Origin: OPINION_HOST },
      },
      pasos,
      "Opinión (PDF)",
    );

    let pdf: Buffer | undefined;
    if (esPdf(pdfRes)) {
      pdf = pdfRes.body; // por si el endpoint respondiera el binario directo
    } else {
      try {
        const json = JSON.parse(texto(pdfRes)) as { ContenidoBase64?: string; Mensaje?: string };
        if (json.ContenidoBase64) pdf = Buffer.from(json.ContenidoBase64, "base64");
        else if (json.Mensaje) pasos.push({ paso: "Opinión (mensaje)", detalle: json.Mensaje });
      } catch {
        /* no fue JSON: se reporta abajo con el cuerpo */
      }
    }

    if (!pdf || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      const cuerpo = texto(pdfRes).replace(/\s+/g, " ").trim().slice(0, 400);
      pasos.push({
        paso: "Opinión (resultado)",
        status: pdfRes.status,
        detalle: `${(pdfRes.headers["content-type"] as string) || ""} · ${pdfRes.body.length} bytes · cuerpo="${cuerpo}"`,
      });
      return {
        ok: false,
        pasos,
        error:
          "La autenticación con la FIEL fue aceptada, pero el portal no devolvió el PDF de la opinión. Copia los pasos del diagnóstico para afinar el flujo.",
      };
    }

    let sentido: OpinionCumplimiento["sentido"] = "desconocido";
    let folio: string | undefined;
    try {
      const textoPdf = await extraerTextoPdf(pdf);
      sentido = sentidoDeTexto(textoPdf);
      folio = folioDeTexto(textoPdf);
    } catch {
      /* el PDF vale aunque no se pueda leer el sentido */
    }
    pasos.push({ paso: "Sentido", detalle: `${sentido}${folio ? ` · folio ${folio}` : ""}` });
    return { ok: true, pdf, sentido, folio, pasos };
  } catch (e) {
    return { ok: false, pasos, error: traducirErrorCsf(e) };
  }
}
