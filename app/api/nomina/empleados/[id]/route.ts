import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getEmpleado, guardarEmpleado, eliminarEmpleado } from "@/lib/nomina/repos";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const { id } = await params;
    const empleado = await getEmpleado(id);
    if (!empleado || empleado.empresaId !== ctx.empresaActiva.id) return fail("Empleado no encontrado", 404);
    const body = await req.json();
    if (typeof body.activo === "boolean") empleado.activo = body.activo;
    await guardarEmpleado(empleado);
    return ok(empleado);
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const { id } = await params;
    const empleado = await getEmpleado(id);
    if (!empleado || empleado.empresaId !== ctx.empresaActiva.id) return fail("Empleado no encontrado", 404);
    await eliminarEmpleado(ctx.empresaActiva.id, id);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
