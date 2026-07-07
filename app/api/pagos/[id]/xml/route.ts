import { fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getPagoRep } from "@/lib/repos";
import { leerXml, idEmitido, idCfdi } from "@/lib/archivos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const pago = await getPagoRep(id);
    if (!pago) return fail("XML no disponible", 404);
    await requireEmpresa(ctx, pago.empresaId);
    const idArchivo =
      pago.origen === "descarga" && pago.uuid
        ? idCfdi(pago.empresaId, pago.uuid)
        : idEmitido("pago", pago.id);
    const xml = await leerXml(idArchivo, pago.xmlPath);
    if (!xml) return fail("XML no disponible", 404);
    const nombre = `REP_${pago.emisorRfc}_${pago.serie}${pago.folio}${pago.uuid ? "_" + pago.uuid : ""}.xml`;
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}"`,
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
