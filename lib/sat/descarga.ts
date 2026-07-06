import fs from "fs";
import path from "path";
import {
  Fiel,
  FielRequestBuilder,
  HttpsWebClient,
  Service,
  QueryParameters,
  DateTimePeriod,
  DownloadType,
  RequestType,
  CfdiPackageReader,
  MetadataPackageReader,
} from "@nodecfdi/sat-ws-descarga-masiva";
import type { Emisor } from "../types";
import { decryptSecret } from "../secret";
import { bytesCertificado } from "./cert-bytes";
import { DESCARGAS_DIR, ensureDirs } from "../db";

// Descarga masiva de CFDI directamente del SAT usando la FIEL (e.firma) del
// emisor. Flujo oficial del SAT: solicitar → verificar → descargar paquetes.

// Tiempo máximo de espera (ms) para cada llamada al web service del SAT. Es
// importante fijarlo: si no, ante un timeout la librería lanza un Error plano
// sin getResponse() y el flujo revienta con "webError.getResponse is not a
// function". Con timeout explícito, un tiempo agotado sale como error limpio.
const SAT_WS_TIMEOUT_MS = Number(process.env.SAT_WS_TIMEOUT_MS ?? 90_000);

/** Convierte errores crudos del SAT/red en mensajes claros y accionables. */
function traducirErrorSat(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/getResponse is not a function/i.test(msg) || /time ?out/i.test(msg) || /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(msg)) {
    return new Error(
      "El SAT no respondió a tiempo o se interrumpió la conexión. Suele ser intermitente en el web service del SAT: vuelve a intentar en un momento.",
    );
  }
  if (/ENOENT|no such file/i.test(msg)) {
    return new Error(
      "No se encontró la FIEL de esta empresa. Vuelve a subir el .cer y el .key en Emisores → Administrar certificados (ahora se guardan en la base de datos).",
    );
  }
  return e instanceof Error ? e : new Error(msg);
}

function crearServicio(emisor: Emisor): Service {
  if (!emisor.fiel) {
    throw new Error("Este emisor no tiene FIEL (e.firma) cargada. Súbela en la sección Emisores.");
  }
  const { cer, key } = bytesCertificado(emisor, "fiel");
  const fiel = Fiel.create(
    cer.toString("binary"),
    key.toString("binary"),
    decryptSecret(emisor.fiel.passwordEnc),
  );
  if (!fiel.isValid()) {
    throw new Error(
      "La FIEL no es válida para este servicio (puede estar vencida o ser un CSD en lugar de la e.firma).",
    );
  }
  return new Service(new FielRequestBuilder(fiel), new HttpsWebClient(undefined, undefined, SAT_WS_TIMEOUT_MS));
}

export interface SolicitudArgs {
  tipo: "emitidas" | "recibidas";
  formato: "xml" | "metadata";
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
}

export async function solicitarDescarga(emisor: Emisor, args: SolicitudArgs) {
  const service = crearServicio(emisor);
  const parameters = QueryParameters.create()
    .withPeriod(
      DateTimePeriod.createFromValues(
        `${args.fechaInicio} 00:00:00`,
        `${args.fechaFin} 23:59:59`,
      ),
    )
    .withDownloadType(new DownloadType(args.tipo === "emitidas" ? "issued" : "received"))
    .withRequestType(new RequestType(args.formato === "xml" ? "xml" : "metadata"));

  let query;
  try {
    query = await service.query(parameters);
  } catch (e) {
    throw traducirErrorSat(e);
  }
  if (!query.getStatus().isAccepted()) {
    throw new Error(`El SAT no aceptó la solicitud: ${query.getStatus().getMessage()}`);
  }
  return { requestId: query.getRequestId() };
}

export interface EstadoVerificacion {
  aceptada: boolean;
  terminada: boolean;
  fallida: boolean;
  mensaje: string;
  paquetes: string[];
}

export async function verificarDescarga(emisor: Emisor, requestId: string): Promise<EstadoVerificacion> {
  const service = crearServicio(emisor);
  let verify;
  try {
    verify = await service.verify(requestId);
  } catch (e) {
    throw traducirErrorSat(e);
  }
  if (!verify.getStatus().isAccepted()) {
    return {
      aceptada: false,
      terminada: false,
      fallida: true,
      mensaje: `Fallo al verificar: ${verify.getStatus().getMessage()}`,
      paquetes: [],
    };
  }
  const statusRequest = verify.getStatusRequest();
  if (
    statusRequest.isTypeOf("Expired") ||
    statusRequest.isTypeOf("Failure") ||
    statusRequest.isTypeOf("Rejected")
  ) {
    return {
      aceptada: true,
      terminada: false,
      fallida: true,
      mensaje: "El SAT rechazó o expiró la solicitud (puede no haber CFDI en el periodo).",
      paquetes: [],
    };
  }
  if (statusRequest.isTypeOf("Finished")) {
    return {
      aceptada: true,
      terminada: true,
      fallida: false,
      mensaje: `Solicitud lista con ${verify.countPackages()} paquete(s).`,
      paquetes: [...verify.getPackageIds()],
    };
  }
  return {
    aceptada: true,
    terminada: false,
    fallida: false,
    mensaje: "El SAT sigue procesando la solicitud. Vuelve a verificar en unos minutos.",
    paquetes: [],
  };
}

export async function descargarPaquete(emisor: Emisor, packageId: string): Promise<string> {
  ensureDirs();
  const service = crearServicio(emisor);
  let download;
  try {
    download = await service.download(packageId);
  } catch (e) {
    throw traducirErrorSat(e);
  }
  if (!download.getStatus().isAccepted()) {
    throw new Error(`No se pudo descargar el paquete: ${download.getStatus().getMessage()}`);
  }
  const zipPath = path.join(DESCARGAS_DIR, `${packageId}.zip`);
  fs.writeFileSync(zipPath, Buffer.from(download.getPackageContent(), "base64"));
  return zipPath;
}

export interface ContenidoPaquete {
  tipo: "cfdi" | "metadata";
  archivos: { nombre: string; contenido?: string }[];
  metadata: Record<string, string>[];
}

export async function leerPaquete(zipPath: string, formato: "xml" | "metadata"): Promise<ContenidoPaquete> {
  if (formato === "xml") {
    const reader = await CfdiPackageReader.createFromFile(zipPath);
    const archivos: { nombre: string; contenido: string }[] = [];
    for await (const map of reader.cfdis()) {
      for (const [nombre, contenido] of map) {
        archivos.push({ nombre: `${nombre}.xml`, contenido });
      }
    }
    return { tipo: "cfdi", archivos, metadata: [] };
  }
  const reader = await MetadataPackageReader.createFromFile(zipPath);
  const filas: Record<string, string>[] = [];
  for await (const item of reader.metadata()) {
    filas.push({
      uuid: item.get("uuid"),
      rfcEmisor: item.get("rfcEmisor"),
      nombreEmisor: item.get("nombreEmisor"),
      rfcReceptor: item.get("rfcReceptor"),
      nombreReceptor: item.get("nombreReceptor"),
      fechaEmision: item.get("fechaEmision"),
      monto: item.get("monto"),
      efectoComprobante: item.get("efectoComprobante"),
      estatus: item.get("estatus"),
    });
  }
  return { tipo: "metadata", archivos: [], metadata: filas };
}
