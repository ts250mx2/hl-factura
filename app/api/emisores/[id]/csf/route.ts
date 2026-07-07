import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getEmpresa } from "@/lib/repos";
import { getConfigFiscal } from "@/lib/contabilidad/repos";
import { leerBinario, idCsf } from "@/lib/archivos";

// Sirve el PDF de la Constancia de Situación Fiscal guardada para una empresa,
// en línea (para abrirla y consultarla en el navegador). Requiere que la empresa
// pertenezca al despacho de la sesión.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const emisor = await getEmpresa(id);
    if (!emisor || emisor.despachoId !== ctx.despachoId) return fail("Empresa no encontrada.", 404);

    const cfg = await getConfigFiscal(id);
    const buf = await leerBinario(idCsf(id), cfg.perfil?.csfArchivo);
    if (!buf) return fail("No hay una constancia guardada para esta empresa.", 404);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="CSF-${emisor.rfc}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
