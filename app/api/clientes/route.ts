import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarClientes, guardarCliente, genId } from "@/lib/repos";
import { validarDatosCliente } from "@/lib/validacion-cliente";
import type { Cliente } from "@/lib/types";

export async function GET() {
  try {
    const ctx = await requireCtx();
    if (!ctx.empresaActiva) return ok([]);
    return ok(await listarClientes(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    if (!ctx.empresaActiva) return fail("Primero crea o selecciona una empresa (RFC).");
    const body = await req.json();
    const { errores, advertencias, datos } = validarDatosCliente(body, await listarClientes(ctx.empresaActiva.id));
    if (errores.length) return failMany(errores);
    const cliente: Cliente = {
      id: genId(),
      empresaId: ctx.empresaActiva.id,
      ...datos,
      creadoEl: new Date().toISOString(),
    };
    await guardarCliente(cliente);
    return ok({ cliente, advertencias });
  } catch (e) {
    return authFail(e);
  }
}
