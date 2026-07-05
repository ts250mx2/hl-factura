import { NextResponse } from "next/server";
import { fail, errorMessage } from "@/lib/api-helpers";
import { verificarPassword, COOKIE_SESION, OPCIONES_COOKIE } from "@/lib/auth";
import { getUsuarioPorEmail, crearSesion } from "@/lib/repos";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const usuario = await getUsuarioPorEmail(email);
    // Mismo mensaje si el usuario no existe o la contraseña falla (no filtrar cuáles correos existen)
    if (!usuario || !verificarPassword(password, usuario.passwordHash)) {
      return fail("Correo o contraseña incorrectos.", 401);
    }
    if (!usuario.activo) return fail("Tu cuenta está desactivada. Contacta al administrador del despacho.", 403);

    const sesionId = await crearSesion(usuario.id);
    const res = NextResponse.json({
      ok: true,
      data: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    });
    res.cookies.set(COOKIE_SESION, sesionId, OPCIONES_COOKIE);
    return res;
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
