import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { calcularPanelFiscal } from "@/lib/contabilidad/fiscal";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");
    const [panel, config] = await Promise.all([
      calcularPanelFiscal(ctx.empresaActiva, anio, mes),
      getConfigFiscal(ctx.empresaActiva.id),
    ]);
    return ok({ panel, config });
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const regimenCalculo = ["ninguno", "resico_pf", "pm_general"].includes(body.regimenCalculo)
      ? body.regimenCalculo
      : "ninguno";
    const coeficiente = Number(body.coeficienteUtilidad);
    await guardarConfigFiscal(ctx.empresaActiva.id, {
      regimenCalculo,
      coeficienteUtilidad: Number.isFinite(coeficiente) && coeficiente >= 0 && coeficiente <= 1 ? coeficiente : 0,
    });
    return ok({ guardado: true });
  } catch (e) {
    return authFail(e);
  }
}
