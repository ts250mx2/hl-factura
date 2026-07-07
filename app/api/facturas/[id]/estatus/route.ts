import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura } from "@/lib/repos";
import { leerXml, idEmitido } from "@/lib/archivos";
import { selloDelXml } from "@/lib/sat/cfdi-parse";
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
    if (!factura.uuid) {
      return fail("La factura no está timbrada; no hay nada que consultar en el SAT.");
    }
    // Las facturas derivadas de la bóveda pueden no tener el sello guardado en
    // su registro (derivaciones previas): se recupera del XML del comprobante.
    let sello = factura.selloCFD;
    if (!sello) {
      const xml = await leerXml(idEmitido("factura", factura.id), factura.xmlPath);
      if (xml) sello = selloDelXml(xml);
    }
    if (!sello) {
      return fail(
        "No se encontró el sello digital del CFDI, necesario para armar la consulta al SAT. Si la factura viene de la bóveda, vuelve a sincronizarla (solo con metadata no es posible consultar).",
      );
    }
    const estatus = await consultarEstatusSat({
      emisorRfc: factura.emisorRfc,
      receptorRfc: factura.receptorRfc,
      total: fmtImporte(factura.total),
      uuid: factura.uuid,
      sello,
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
