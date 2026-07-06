import fs from "fs";
import type { Emisor } from "../types";
import { actualizarEmpresa } from "../repos";

export interface CertBytes {
  cer: Buffer;
  key: Buffer;
}

/**
 * Devuelve los bytes del .cer/.key de un certificado (CSD o FIEL).
 *
 * Los certificados se guardan en la base de datos (base64 dentro del emisor),
 * para no depender de archivos físicos y poder trabajar en local y en el
 * servidor de producción con los mismos datos. Si una instalación previa aún
 * los tiene en disco, se leen de ahí y se migran a la BD de forma transparente
 * la primera vez que se usan.
 */
export function bytesCertificado(emisor: Emisor, tipo: "csd" | "fiel"): CertBytes {
  const info = tipo === "csd" ? emisor.csd : emisor.fiel;
  if (!info) throw new Error(`La empresa no tiene ${tipo.toUpperCase()} cargado.`);

  let cerB64 = info.cerB64;
  let keyB64 = info.keyB64;
  let migrar = false;

  if (!cerB64 && info.cerPath && fs.existsSync(info.cerPath)) {
    cerB64 = fs.readFileSync(info.cerPath).toString("base64");
    migrar = true;
  }
  if (!keyB64 && info.keyPath && fs.existsSync(info.keyPath)) {
    keyB64 = fs.readFileSync(info.keyPath).toString("base64");
    migrar = true;
  }

  if (!cerB64 || !keyB64) {
    throw new Error(
      `No se encontraron los archivos del ${tipo.toUpperCase()} (ni en la base de datos ni en disco). Vuelve a subir el certificado.`,
    );
  }

  if (migrar) {
    // Backfill a la base de datos sin bloquear la operación en curso.
    info.cerB64 = cerB64;
    info.keyB64 = keyB64;
    void actualizarEmpresa(emisor).catch(() => {});
  }

  return { cer: Buffer.from(cerB64, "base64"), key: Buffer.from(keyB64, "base64") };
}
