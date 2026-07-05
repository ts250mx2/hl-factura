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
import { DESCARGAS_DIR, ensureDirs } from "../db";

// Descarga masiva de CFDI directamente del SAT usando la FIEL (e.firma) del
// emisor. Flujo oficial del SAT: solicitar → verificar → descargar paquetes.

function crearServicio(emisor: Emisor): Service {
  if (!emisor.fiel) {
    throw new Error("Este emisor no tiene FIEL (e.firma) cargada. Súbela en la sección Emisores.");
  }
  const fiel = Fiel.create(
    fs.readFileSync(emisor.fiel.cerPath, "binary"),
    fs.readFileSync(emisor.fiel.keyPath, "binary"),
    decryptSecret(emisor.fiel.passwordEnc),
  );
  if (!fiel.isValid()) {
    throw new Error(
      "La FIEL no es válida para este servicio (puede estar vencida o ser un CSD en lugar de la e.firma).",
    );
  }
  return new Service(new FielRequestBuilder(fiel), new HttpsWebClient());
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

  const query = await service.query(parameters);
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
  const verify = await service.verify(requestId);
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
  const download = await service.download(packageId);
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
