import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getProducto, guardarProducto, eliminarProducto } from "@/lib/repos";
import { validarProducto } from "@/lib/validacion-producto";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const producto = await getProducto(id);
    if (!producto) return fail("Producto no encontrado", 404);
    await requireEmpresa(ctx, producto.empresaId);
    return ok(producto);
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const producto = await getProducto(id);
    if (!producto) return fail("Producto no encontrado", 404);
    await requireEmpresa(ctx, producto.empresaId);
    const body = await req.json();
    const { errores, datos } = validarProducto(body);
    if (errores.length) return failMany(errores);
    const actualizado = { ...producto, ...datos };
    await guardarProducto(actualizado);
    return ok(actualizado);
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const producto = await getProducto(id);
    if (!producto) return fail("Producto no encontrado", 404);
    await requireEmpresa(ctx, producto.empresaId);
    await eliminarProducto(id);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
