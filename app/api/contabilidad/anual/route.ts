import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { calcularAnual } from "@/lib/contabilidad/anual";

// Declaración anual pre-llenada del ejercicio. Los ajustes (deducciones
// personales, pagos provisionales, PTU, pérdidas) llegan por query y se
// recalculan sin volver a leer la contabilidad.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    if (!/^\d{4}$/.test(anio)) return fail("Año inválido.");
    const num = (k: string) => {
      const v = Number(url.searchParams.get(k));
      return Number.isFinite(v) && v >= 0 ? v : 0;
    };
    const ajustes = {
      deduccionesPersonales: num("dedPersonales"),
      pagosProvisionales: num("pagosProv"),
      ptuPagada: num("ptu"),
      perdidasFiscales: num("perdidas"),
    };
    return ok(await calcularAnual(ctx.empresaActiva, anio, ajustes));
  } catch (e) {
    return authFail(e);
  }
}
