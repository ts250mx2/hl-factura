import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura } from "@/lib/repos";
import { reintentarTimbrado, ErrorValidacion } from "@/lib/emision";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const factura = await getFactura(id);
    if (!factura) return fail("Factura no encontrada", 404);
    const empresa = await requireEmpresa(ctx, factura.emisorId);
    const actualizada = await reintentarTimbrado(factura, empresa);
    return ok(actualizada);
  } catch (e) {
    if (e instanceof ErrorValidacion) return failMany(e.errores);
    return authFail(e);
  }
}
