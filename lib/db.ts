import fs from "fs";
import path from "path";

// Rutas de almacenamiento local. Los datos estructurados viven en SQLite
// (lib/sql.ts); aquí solo se administran las carpetas de archivos.

export const DATA_DIR = path.join(process.cwd(), "data");
export const CERTS_DIR = path.join(DATA_DIR, "certificados");
export const CFDI_DIR = path.join(DATA_DIR, "cfdi");
export const DESCARGAS_DIR = path.join(DATA_DIR, "descargas");

export function ensureDirs() {
  for (const dir of [DATA_DIR, CERTS_DIR, CFDI_DIR, DESCARGAS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
