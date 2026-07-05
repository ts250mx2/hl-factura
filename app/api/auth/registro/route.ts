import { NextResponse } from "next/server";
import { fail, errorMessage } from "@/lib/api-helpers";
import { hashPassword, COOKIE_SESION, OPCIONES_COOKIE } from "@/lib/auth";
import { contarUsuarios, crearDespacho, crearUsuario, crearSesion, getUsuarioPorEmail } from "@/lib/repos";
import { migrarLegacyJson } from "@/lib/sql";

// Registro de un despacho NUEVO (disponible siempre, no solo en el primer
// arranque). Cada despacho es un espacio aislado con su propio administrador,
// empresas, usuarios y configuración.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const despachoNombre = String(body.despacho || "").trim();
    const nombre = String(body.nombre || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!despachoNombre) return fail("Escribe el nombre del despacho o empresa.");
    if (!nombre) return fail("Escribe tu nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("El correo no es válido.");
    if (password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");
    if (await getUsuarioPorEmail(email)) {
      return fail("Ese correo ya tiene una cuenta. Inicia sesión, o usa otro correo para el nuevo despacho.");
    }

    const esPrimero = (await contarUsuarios()) === 0;
    const despacho = await crearDespacho(despachoNombre);
    const usuario = await crearUsuario({
      despachoId: despacho.id,
      email,
      nombre,
      passwordHash: hashPassword(password),
      rol: "admin",
    });
    // Los datos del formato mono-usuario solo se migran al primer despacho del sistema
    const migracion = esPrimero ? await migrarLegacyJson(despacho.id) : { migrado: false };
    const sesionId = await crearSesion(usuario.id);

    const res = NextResponse.json({
      ok: true,
      data: { usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }, despacho, datosMigrados: migracion.migrado },
    });
    res.cookies.set(COOKIE_SESION, sesionId, OPCIONES_COOKIE);
    return res;
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
