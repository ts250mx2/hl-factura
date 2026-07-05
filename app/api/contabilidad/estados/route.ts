import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { estadosFinancieros } from "@/lib/contabilidad/estados-financieros";

// Estados financieros del periodo: estado de resultados + situación financiera.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");
    return ok(await estadosFinancieros(ctx.empresaActiva.id, anio, mes));
  } catch (e) {
    return authFail(e);
  }
}
