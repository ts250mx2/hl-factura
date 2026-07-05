import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarProductos, guardarProducto, genId } from "@/lib/repos";
import { validarProducto } from "@/lib/validacion-producto";
import type { Producto } from "@/lib/types";

export async function GET() {
  try {
    const ctx = await requireCtx();
    if (!ctx.empresaActiva) return ok([]);
    return ok(await listarProductos(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    if (!ctx.empresaActiva) return fail("Primero crea o selecciona una empresa (RFC).");
    const body = await req.json();
    const { errores, datos } = validarProducto(body);
    if (errores.length) return failMany(errores);
    const producto: Producto = {
      id: genId(),
      empresaId: ctx.empresaActiva.id,
      ...datos,
      creadoEl: new Date().toISOString(),
    };
    await guardarProducto(producto);
    return ok(producto);
  } catch (e) {
    return authFail(e);
  }
}
