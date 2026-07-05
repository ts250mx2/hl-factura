import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura } from "@/lib/repos";
import { consultarEstatusSat } from "@/lib/sat/estatus";
import { fmtImporte } from "@/lib/sat/importes";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const factura = await getFactura(id);
    if (!factura) return fail("Factura no encontrada", 404);
    await requireEmpresa(ctx, factura.emisorId);
    if (!factura.uuid || !factura.selloCFD) {
      return fail("La factura no está timbrada; no hay nada que consultar en el SAT.");
    }
    const estatus = await consultarEstatusSat({
      emisorRfc: factura.emisorRfc,
      receptorRfc: factura.receptorRfc,
      total: fmtImporte(factura.total),
      uuid: factura.uuid,
      sello: factura.selloCFD,
    });
    return ok({
      ...estatus,
      nota: factura.demo
        ? "Esta factura fue timbrada en modo DEMO: el SAT responderá 'No Encontrado' porque nunca se registró realmente."
        : undefined,
    });
  } catch (e) {
    return authFail(e);
  }
}
