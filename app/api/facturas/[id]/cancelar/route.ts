import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura, guardarFactura, getConfigPac } from "@/lib/repos";
import { cancelar } from "@/lib/sat/timbrado";
import { MOTIVOS_CANCELACION } from "@/lib/sat/catalogos";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const body = await req.json();
    const motivo = String(body.motivo || "");
    const folioSustitucion = String(body.folioSustitucion || "").trim() || undefined;

    if (!MOTIVOS_CANCELACION.some((m) => m.clave === motivo)) {
      return fail("Selecciona un motivo de cancelación válido (01-04).");
    }
    if (motivo === "01" && !folioSustitucion) {
      return fail("El motivo 01 requiere el UUID del comprobante que sustituye.");
    }

    const factura = await getFactura(id);
    if (!factura) return fail("Factura no encontrada", 404);
    const empresa = await requireEmpresa(ctx, factura.emisorId);
    if (factura.estado !== "timbrada") return fail("Solo se pueden cancelar facturas timbradas.");

    const resultado = await cancelar(
      { uuid: factura.uuid!, motivo, folioSustitucion, emisor: empresa },
      await getConfigPac(ctx.despachoId),
    );

    factura.estado = "cancelada";
    factura.cancelacion = {
      fecha: new Date().toISOString(),
      motivo,
      folioSustitucion,
      estatus: resultado.estatus,
    };
    await guardarFactura(factura);

    return ok(resultado);
  } catch (e) {
    return authFail(e);
  }
}
