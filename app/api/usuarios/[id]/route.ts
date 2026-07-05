import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail, hashPassword } from "@/lib/auth";
import { getUsuario, actualizarUsuario, asignarEmpresas, eliminarUsuario } from "@/lib/repos";
import type { Rol } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const ROLES: Rol[] = ["admin", "supervisor", "auxiliar", "cliente"];

export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin"]);
    const { id } = await params;
    const usuario = await getUsuario(id);
    if (!usuario || usuario.despachoId !== ctx.despachoId) return fail("Usuario no encontrado", 404);

    const body = await req.json();
    const patch: Parameters<typeof actualizarUsuario>[1] = {};
    if (typeof body.nombre === "string" && body.nombre.trim()) patch.nombre = body.nombre.trim();
    if (typeof body.rol === "string" && ROLES.includes(body.rol as Rol)) {
      if (usuario.id === ctx.usuario.id && body.rol !== "admin") {
        return fail("No puedes quitarte a ti mismo el rol de administrador.");
      }
      patch.rol = body.rol as Rol;
    }
    if (typeof body.activo === "boolean") {
      if (usuario.id === ctx.usuario.id && !body.activo) return fail("No puedes desactivar tu propia cuenta.");
      patch.activo = body.activo;
    }
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");
      patch.passwordHash = hashPassword(body.password);
    }
    await actualizarUsuario(id, patch);

    if (Array.isArray(body.empresaIds)) {
      const idsValidos = body.empresaIds.map(String).filter((eid: string) => ctx.empresas.some((e) => e.id === eid));
      await asignarEmpresas(id, idsValidos);
    }
    return ok(await getUsuario(id));
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin"]);
    const { id } = await params;
    if (id === ctx.usuario.id) return fail("No puedes eliminar tu propia cuenta.");
    const usuario = await getUsuario(id);
    if (!usuario || usuario.despachoId !== ctx.despachoId) return fail("Usuario no encontrado", 404);
    await eliminarUsuario(id);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
