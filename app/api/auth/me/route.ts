import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getDespacho } from "@/lib/repos";

export async function GET() {
  try {
    const ctx = await requireCtx();
    return ok({
      usuario: {
        id: ctx.usuario.id,
        nombre: ctx.usuario.nombre,
        email: ctx.usuario.email,
        rol: ctx.usuario.rol,
      },
      despacho: await getDespacho(ctx.despachoId),
      empresas: ctx.empresas.map((e) => ({ id: e.id, rfc: e.rfc, nombre: e.nombre, colorTag: e.colorTag })),
      empresaActivaId: ctx.empresaActiva?.id ?? null,
    });
  } catch (e) {
    return authFail(e);
  }
}
