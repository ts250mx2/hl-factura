import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DATA_DIR, ensureDirs } from "./db";

// Las contraseñas de las llaves privadas nunca se guardan en claro:
// se cifran con AES-256-GCM usando una llave local generada en el primer arranque.

const SECRET_PATH = path.join(DATA_DIR, ".secret");

function getKey(): Buffer {
  ensureDirs();
  if (!fs.existsSync(SECRET_PATH)) {
    fs.writeFileSync(SECRET_PATH, crypto.randomBytes(32).toString("hex"), "utf8");
  }
  return Buffer.from(fs.readFileSync(SECRET_PATH, "utf8").trim(), "hex");
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
