import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { calcularAuxiliar } from "@/lib/contabilidad/auxiliar";

// Auxiliar (mayor) de una cuenta en el periodo de la empresa activa.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    const cuenta = String(url.searchParams.get("cuenta") || "");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");
    if (!cuenta) return fail("Indica la cuenta.");
    return ok(await calcularAuxiliar(ctx.empresaActiva.id, anio, mes, cuenta));
  } catch (e) {
    return authFail(e);
  }
}
