import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarRecibos } from "@/lib/nomina/repos";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    return ok(await listarRecibos(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}
