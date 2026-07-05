import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { calcularPanelFiscal } from "@/lib/contabilidad/fiscal";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";
import { sanitizarPerfil } from "@/lib/contabilidad/obligaciones";
import type { ConfigFiscal, MetodoIsr } from "@/lib/types";

const METODOS: MetodoIsr[] = [
  "auto", "ninguno", "resico_pf", "resico_pm", "pm_general", "pf_actividad", "arrendamiento",
];

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
    const body = (await req.json()) as Record<string, unknown>;
    const cfg = await getConfigFiscal(ctx.empresaActiva.id);

    const regimenCalculo = METODOS.includes(body.regimenCalculo as MetodoIsr)
      ? (body.regimenCalculo as MetodoIsr)
      : cfg.regimenCalculo;
    const coeficiente = Number(body.coeficienteUtilidad);

    const nuevo: ConfigFiscal = {
      ...cfg,
      regimenCalculo,
      coeficienteUtilidad:
        Number.isFinite(coeficiente) && coeficiente >= 0 && coeficiente <= 1 ? coeficiente : cfg.coeficienteUtilidad,
      deduccionCiegaArrendamiento:
        typeof body.deduccionCiegaArrendamiento === "boolean"
          ? body.deduccionCiegaArrendamiento
          : cfg.deduccionCiegaArrendamiento,
    };
    if (body.perfil !== undefined) nuevo.perfil = sanitizarPerfil(body.perfil, cfg.perfil);

    await guardarConfigFiscal(ctx.empresaActiva.id, nuevo);
    return ok({ config: nuevo });
  } catch (e) {
    return authFail(e);
  }
}
