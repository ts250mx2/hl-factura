import { NextResponse } from "next/server";
import { fail, errorMessage } from "@/lib/api-helpers";
import { hashPassword, COOKIE_SESION, OPCIONES_COOKIE } from "@/lib/auth";
import { contarUsuarios, crearDespacho, crearUsuario, crearSesion } from "@/lib/repos";
import { migrarLegacyJson } from "@/lib/sql";

// Registro inicial: crea el despacho y su usuario administrador.
// Solo funciona cuando no existe ningún usuario (primer arranque).
export async function POST(req: Request) {
  try {
    if ((await contarUsuarios()) > 0) {
      return fail("El sistema ya está inicializado. Inicia sesión.", 400);
    }
    const body = await req.json();
    const despachoNombre = String(body.despacho || "").trim();
    const nombre = String(body.nombre || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!despachoNombre) return fail("Escribe el nombre del despacho o empresa.");
    if (!nombre) return fail("Escribe tu nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("El correo no es válido.");
    if (password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");

    const despacho = await crearDespacho(despachoNombre);
    const usuario = await crearUsuario({
      despachoId: despacho.id,
      email,
      nombre,
      passwordHash: hashPassword(password),
      rol: "admin",
    });
    const migracion = await migrarLegacyJson(despacho.id);
    const sesionId = await crearSesion(usuario.id);

    const res = NextResponse.json({
      ok: true,
      data: { usuario: { ...usuario }, despacho, datosMigrados: migracion.migrado },
    });
    res.cookies.set(COOKIE_SESION, sesionId, OPCIONES_COOKIE);
    return res;
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
