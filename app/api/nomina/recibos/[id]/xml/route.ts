import { fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getRecibo } from "@/lib/nomina/repos";
import { leerXml, idEmitido } from "@/lib/archivos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    const { id } = await params;
    const recibo = await getRecibo(id);
    if (!recibo) return fail("XML no disponible", 404);
    await requireEmpresa(ctx, recibo.empresaId);
    const xml = await leerXml(idEmitido("recibo", recibo.id), recibo.xmlPath);
    if (!xml) return fail("XML no disponible", 404);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="nomina_${recibo.empleadoRfc}_${recibo.periodoInicio}.xml"`,
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
