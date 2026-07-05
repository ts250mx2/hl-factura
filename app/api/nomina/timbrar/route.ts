import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { validarPeriodo } from "@/lib/nomina/calculo";
import { timbrarNomina, type ItemCorrida } from "@/lib/nomina/emision";

// Timbrado masivo de la corrida de nómina.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const periodo = validarPeriodo(body);
    if (!periodo) return fail("Periodo inválido (máximo 31 días).");
    const items = (Array.isArray(body.items) ? body.items : []) as ItemCorrida[];
    if (!items.length) return fail("Selecciona al menos un empleado.");
    const resultado = await timbrarNomina(ctx.empresaActiva, periodo, items);
    return ok(resultado);
  } catch (e) {
    return authFail(e);
  }
}
