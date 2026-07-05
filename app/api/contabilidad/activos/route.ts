import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarActivos, guardarActivo, eliminarActivo } from "@/lib/contabilidad/repos";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    return ok(await listarActivos(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const descripcion = String(body.descripcion || "").trim();
    const moi = Number(body.moi);
    const fechaAdquisicion = String(body.fechaAdquisicion || "");
    const tasaAnual = Number(body.tasaAnual);
    if (!descripcion) return fail("Describe el activo.");
    if (!Number.isFinite(moi) || moi <= 0) return fail("El monto original de la inversión debe ser mayor a cero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAdquisicion)) return fail("Fecha de adquisición inválida.");
    if (!Number.isFinite(tasaAnual) || tasaAnual <= 0 || tasaAnual > 100) return fail("Tasa anual inválida (1-100%).");
    await guardarActivo({ empresaId: ctx.empresaActiva.id, descripcion, moi, fechaAdquisicion, tasaAnual });
    return ok({ guardado: true });
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Falta el id.");
    await eliminarActivo(ctx.empresaActiva.id, id);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
