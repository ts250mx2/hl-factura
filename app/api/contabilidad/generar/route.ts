import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { generarPolizasPeriodo } from "@/lib/contabilidad/polizas";

// Genera (o regenera) las pólizas automáticas de un periodo para la empresa activa.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const anio = String(body.anio || "");
    const mes = String(body.mes || "").padStart(2, "0");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");
    const resultado = await generarPolizasPeriodo(ctx.empresaActiva, anio, mes, {
      regenerar: body.regenerar === true,
    });
    return ok(resultado);
  } catch (e) {
    return authFail(e);
  }
}
