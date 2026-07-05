import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_SESION, COOKIE_EMPRESA } from "@/lib/auth";
import { eliminarSesion } from "@/lib/repos";

export async function POST() {
  const jar = await cookies();
  const sesionId = jar.get(COOKIE_SESION)?.value;
  // Limpiamos la cookie aunque el borrado en MySQL falle, para no dejar al
  // usuario atrapado con una cookie inválida (evita el bucle de redirección).
  if (sesionId) {
    try {
      await eliminarSesion(sesionId);
    } catch {
      /* la cookie se borra igual abajo */
    }
  }
  const res = NextResponse.json({ ok: true, data: { adios: true } });
  res.cookies.delete(COOKIE_SESION);
  res.cookies.delete(COOKIE_EMPRESA);
  return res;
}
