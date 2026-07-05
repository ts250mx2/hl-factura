import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail, hashPassword } from "@/lib/auth";
import { listarUsuarios, crearUsuario, getUsuarioPorEmail } from "@/lib/repos";
import type { Rol } from "@/lib/types";

const ROLES: Rol[] = ["admin", "supervisor", "auxiliar", "cliente"];

export async function GET() {
  try {
    const ctx = await requireCtx(["admin"]);
    return ok(await listarUsuarios(ctx.despachoId));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin"]);
    const body = await req.json();
    const nombre = String(body.nombre || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const rol = String(body.rol || "") as Rol;
    const empresaIds: string[] = Array.isArray(body.empresaIds) ? body.empresaIds.map(String) : [];

    if (!nombre) return fail("Escribe el nombre del usuario.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("El correo no es válido.");
    if (password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");
    if (!ROLES.includes(rol)) return fail("Rol inválido.");
    if (await getUsuarioPorEmail(email)) return fail("Ya existe un usuario con ese correo.");

    // auxiliar y cliente requieren empresas asignadas; validar que sean del despacho
    const idsValidos = empresaIds.filter((id) => ctx.empresas.some((e) => e.id === id));
    if ((rol === "auxiliar" || rol === "cliente") && idsValidos.length === 0) {
      return fail("Asigna al menos una empresa (RFC) a este usuario.");
    }

    const usuario = await crearUsuario({
      despachoId: ctx.despachoId,
      email,
      nombre,
      passwordHash: hashPassword(password),
      rol,
      empresaIds: rol === "admin" || rol === "supervisor" ? [] : idsValidos,
    });
    return ok(usuario);
  } catch (e) {
    return authFail(e);
  }
}
