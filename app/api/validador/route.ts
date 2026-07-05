import { ok, fail, errorMessage } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { validarCfdiXml } from "@/lib/sat/validador";
import { consultarEstatusSat } from "@/lib/sat/estatus";

// Valida un XML de CFDI: estructura, sello digital y (opcional) estatus real en el SAT.
export async function POST(req: Request) {
  try {
    await requireCtx();
  } catch (e) {
    return authFail(e);
  }
  try {
    const form = await req.formData();
    const archivo = form.get("xml");
    const consultarSat = String(form.get("consultarSat") || "") === "1";
    if (!(archivo instanceof File)) return fail("Sube un archivo XML de CFDI.");
    const xml = Buffer.from(await archivo.arrayBuffer()).toString("utf8");

    const reporte = validarCfdiXml(xml);

    let estatusSat = null;
    let errorSat: string | null = null;
    if (consultarSat && reporte.timbrado && reporte.uuid && reporte.selloCFD) {
      try {
        estatusSat = await consultarEstatusSat({
          emisorRfc: reporte.emisor.rfc,
          receptorRfc: reporte.receptor.rfc,
          total: reporte.total,
          uuid: reporte.uuid,
          sello: reporte.selloCFD,
        });
      } catch (e) {
        errorSat = errorMessage(e);
      }
    }

    return ok({ reporte, estatusSat, errorSat });
  } catch (e) {
    return fail(errorMessage(e));
  }
}
