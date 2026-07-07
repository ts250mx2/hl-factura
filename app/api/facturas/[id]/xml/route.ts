import { fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura } from "@/lib/repos";
import { leerXml, idEmitido, idCfdi } from "@/lib/archivos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const factura = await getFactura(id);
    if (!factura) return fail("XML no disponible", 404);
    await requireEmpresa(ctx, factura.emisorId);
    // Los CFDI descargados de la bóveda guardan su XML bajo el marcador de bóveda.
    const idArchivo =
      factura.origen === "descarga" && factura.uuid
        ? idCfdi(factura.emisorId, factura.uuid)
        : idEmitido("factura", factura.id);
    const xml = await leerXml(idArchivo, factura.xmlPath);
    if (!xml) return fail("XML no disponible", 404);
    const nombre = `${factura.emisorRfc}_${factura.serie}${factura.folio}${factura.uuid ? "_" + factura.uuid : ""}.xml`;
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
