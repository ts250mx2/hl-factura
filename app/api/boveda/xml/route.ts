import { fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getCfdiDescargado } from "@/lib/repos";
import { leerXml, idCfdi } from "@/lib/archivos";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx();
    const url = new URL(req.url);
    const uuid = String(url.searchParams.get("uuid") || "").toUpperCase();
    const empresaId = String(url.searchParams.get("empresaId") || "");
    await requireEmpresa(ctx, empresaId);

    const cfdi = await getCfdiDescargado(uuid, empresaId);
    const xml = cfdi ? await leerXml(idCfdi(empresaId, uuid), cfdi.xmlPath) : null;
    if (!xml) {
      return fail("El XML de este CFDI no está en la bóveda (solo se tiene su metadata).", 404);
    }
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${uuid}.xml"`,
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
