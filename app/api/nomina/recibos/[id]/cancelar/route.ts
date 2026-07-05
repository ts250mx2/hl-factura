import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getRecibo, guardarRecibo } from "@/lib/nomina/repos";
import { getConfigPac } from "@/lib/repos";
import { cancelar } from "@/lib/sat/timbrado";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const { id } = await params;
    const recibo = await getRecibo(id);
    if (!recibo) return fail("Recibo no encontrado", 404);
    const empresa = await requireEmpresa(ctx, recibo.empresaId);
    if (recibo.estado !== "timbrada") return fail("Solo se cancelan recibos timbrados.");
    const resultado = await cancelar(
      { uuid: recibo.uuid!, motivo: "02", emisor: empresa },
      await getConfigPac(ctx.despachoId),
    );
    recibo.estado = "cancelada";
    await guardarRecibo(recibo);
    return ok(resultado);
  } catch (e) {
    return authFail(e);
  }
}
