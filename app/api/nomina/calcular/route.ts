import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { calcularRecibo, validarPeriodo } from "@/lib/nomina/calculo";
import { getConfigNomina, getEmpleado } from "@/lib/nomina/repos";
import type { IncidenciasEmpleado } from "@/lib/nomina/tipos";

// Vista previa del cálculo (sin timbrar).
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const periodo = validarPeriodo(body);
    if (!periodo) return fail("Periodo inválido (máximo 31 días).");
    const items = (Array.isArray(body.items) ? body.items : []) as { empleadoId: string; incidencias: IncidenciasEmpleado }[];
    if (!items.length) return fail("Selecciona al menos un empleado.");

    const config = await getConfigNomina(ctx.empresaActiva.id);
    const resultados = [];
    for (const item of items) {
      const empleado = await getEmpleado(item.empleadoId);
      if (!empleado || empleado.empresaId !== ctx.empresaActiva.id) continue;
      resultados.push({
        empleadoId: empleado.id,
        nombre: empleado.nombre,
        calculo: calcularRecibo(empleado, config, periodo, item.incidencias),
      });
    }
    return ok({ periodo, resultados });
  } catch (e) {
    return authFail(e);
  }
}
