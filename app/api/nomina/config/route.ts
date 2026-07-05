import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getConfigNomina, guardarConfigNomina } from "@/lib/nomina/repos";
import { ENTIDADES_FEDERATIVAS } from "@/lib/nomina/catalogos";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    return ok(await getConfigNomina(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const cfg = await getConfigNomina(ctx.empresaActiva.id);
    if (typeof body.registroPatronal === "string") cfg.registroPatronal = body.registroPatronal.trim().toUpperCase();
    if (ENTIDADES_FEDERATIVAS.some((e) => e.clave === body.claveEntFed)) cfg.claveEntFed = body.claveEntFed;
    const num = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : null;
    };
    const prima = num(body.primaRiesgo, 0.1, 15);
    if (prima !== null) cfg.primaRiesgo = prima;
    const uma = num(body.uma, 50, 500);
    if (uma !== null) cfg.uma = uma;
    const sm = num(body.salarioMinimo, 100, 1000);
    if (sm !== null) cfg.salarioMinimo = sm;
    const sub = num(body.subsidioMensual, 0, 5000);
    if (sub !== null) cfg.subsidioMensual = sub;
    const tope = num(body.subsidioTopeIngresos, 0, 100000);
    if (tope !== null) cfg.subsidioTopeIngresos = tope;
    await guardarConfigNomina(ctx.empresaActiva.id, cfg);
    return ok(cfg);
  } catch (e) {
    return authFail(e);
  }
}
