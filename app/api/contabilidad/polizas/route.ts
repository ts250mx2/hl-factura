import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarPolizas, eliminarPoliza } from "@/lib/contabilidad/repos";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");
    return ok(await listarPolizas(ctx.empresaActiva.id, anio, mes));
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
    await eliminarPoliza(ctx.empresaActiva.id, id);
    return ok({ eliminada: true });
  } catch (e) {
    return authFail(e);
  }
}
