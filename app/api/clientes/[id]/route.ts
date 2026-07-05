import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getCliente, guardarCliente, eliminarCliente, listarClientes, facturasTimbradasDeCliente } from "@/lib/repos";
import { validarDatosCliente } from "@/lib/validacion-cliente";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const cliente = await getCliente(id);
    if (!cliente) return fail("Cliente no encontrado", 404);
    await requireEmpresa(ctx, cliente.empresaId);
    return ok(cliente);
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const cliente = await getCliente(id);
    if (!cliente) return fail("Cliente no encontrado", 404);
    await requireEmpresa(ctx, cliente.empresaId);

    const body = await req.json();
    const { errores, datos } = validarDatosCliente(body, await listarClientes(cliente.empresaId), id);
    if (errores.length) return failMany(errores);
    const actualizado = { ...cliente, ...datos };
    await guardarCliente(actualizado);
    return ok(actualizado);
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const cliente = await getCliente(id);
    if (!cliente) return fail("Cliente no encontrado", 404);
    await requireEmpresa(ctx, cliente.empresaId);
    if (await facturasTimbradasDeCliente(id)) {
      return fail("No se puede eliminar: el cliente tiene facturas timbradas.");
    }
    await eliminarCliente(id);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
