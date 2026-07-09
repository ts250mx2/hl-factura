import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { proyectarFlujo } from "@/lib/flujo";

// Proyección de flujo de efectivo de la empresa activa ("Trabajando en").
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const semanas = Number(url.searchParams.get("semanas") || 8);
    const saldoInicial = Number(url.searchParams.get("saldoInicial") || 0);
    return ok(await proyectarFlujo(ctx.empresaActiva, Number.isFinite(saldoInicial) ? saldoInicial : 0, semanas));
  } catch (e) {
    return authFail(e);
  }
}
