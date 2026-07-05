import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getPagoRep, guardarPagoRep, getConfigPac } from "@/lib/repos";
import { cancelar } from "@/lib/sat/timbrado";

type Params = { params: Promise<{ id: string }> };

// Cancela un REP ante el SAT (motivo 02: errores sin relación es lo habitual).
export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const motivo = String(body.motivo || "02");

    const pago = await getPagoRep(id);
    if (!pago) return fail("Complemento no encontrado", 404);
    const empresa = await requireEmpresa(ctx, pago.empresaId);
    if (pago.estado !== "timbrada") return fail("Solo se cancelan complementos timbrados.");

    const resultado = await cancelar(
      { uuid: pago.uuid!, motivo, emisor: empresa },
      await getConfigPac(ctx.despachoId),
    );
    pago.estado = "cancelada";
    await guardarPagoRep(pago);
    return ok(resultado);
  } catch (e) {
    return authFail(e);
  }
}
