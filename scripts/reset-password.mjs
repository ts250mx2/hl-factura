// Restablece la contraseña de un usuario en la base MySQL del portal.
// Uso:  node scripts/reset-password.mjs correo@despacho.mx NuevaContrasena
// Lee las credenciales de la base desde el archivo .env del proyecto.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Parseo mínimo de .env (sin dependencias) ---
const envPath = path.join(__dirname, "..", ".env");
const env = {};
for (const linea of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: node scripts/reset-password.mjs <correo> <nueva-contrasena>");
  process.exit(1);
}

// Mismo algoritmo que lib/auth.ts -> hashPassword()
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");
const passwordHash = `${salt}:${hash}`;

const pool = mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 3306),
  user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
  connectTimeout: 15000,
});

const [r] = await pool.query(
  "UPDATE usuarios SET passwordHash = ? WHERE email = ?",
  [passwordHash, email.toLowerCase()],
);
if (r.affectedRows === 0) {
  console.error(`No existe ningún usuario con el correo ${email} en MySQL.`);
} else {
  console.log(`Contraseña actualizada para ${email}. Ya puedes iniciar sesión.`);
}
await pool.end();
