import QRCode from "qrcode";
import { fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura } from "@/lib/repos";
import { urlVerificacionSat } from "@/lib/sat/estatus";
import { fmtImporte } from "@/lib/sat/importes";

type Params = { params: Promise<{ id: string }> };

// QR de la representación impresa: apunta al verificador público del SAT.
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const factura = await getFactura(id);
    if (!factura || !factura.uuid || !factura.selloCFD) return fail("Factura sin timbre", 404);
    await requireEmpresa(ctx, factura.emisorId);
    const url = urlVerificacionSat({
      emisorRfc: factura.emisorRfc,
      receptorRfc: factura.receptorRfc,
      total: fmtImporte(factura.total),
      uuid: factura.uuid,
      sello: factura.selloCFD,
    });
    const png = await QRCode.toBuffer(url, { width: 320, margin: 1, errorCorrectionLevel: "M" });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
  } catch (e) {
    return authFail(e);
  }
}
