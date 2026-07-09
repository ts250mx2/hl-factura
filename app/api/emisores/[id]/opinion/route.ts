import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getEmpresa } from "@/lib/repos";
import { leerBinario, idOpinion } from "@/lib/archivos";

// Sirve el PDF de la Opinión de Cumplimiento (32-D) guardada, en línea.
// Requiere que la empresa pertenezca al despacho de la sesión.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const emisor = await getEmpresa(id);
    if (!emisor || emisor.despachoId !== ctx.despachoId) return fail("Empresa no encontrada.", 404);

    const buf = await leerBinario(idOpinion(id));
    if (!buf) return fail("No hay una opinión de cumplimiento guardada para esta empresa.", 404);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Opinion-32D-${emisor.rfc}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
