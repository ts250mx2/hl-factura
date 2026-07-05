import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getRecibo } from "@/lib/nomina/repos";
import { enviarRecibos } from "@/lib/nomina/emision";
import type { ReciboNomina } from "@/lib/nomina/tipos";

// Envía por correo los recibos indicados a cada trabajador.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const ids = (Array.isArray(body.reciboIds) ? body.reciboIds : []).map(String);
    if (!ids.length) return fail("Indica los recibos a enviar.");
    const recibos: ReciboNomina[] = [];
    for (const id of ids) {
      const r = await getRecibo(id);
      if (r && r.empresaId === ctx.empresaActiva.id) recibos.push(r);
    }
    const resultado = await enviarRecibos(ctx.empresaActiva, recibos);
    return ok(resultado);
  } catch (e) {
    return authFail(e);
  }
}
