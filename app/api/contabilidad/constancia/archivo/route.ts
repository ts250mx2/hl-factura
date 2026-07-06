import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getConfigFiscal } from "@/lib/contabilidad/repos";
import { leerBinario, idCsf } from "@/lib/archivos";

// Devuelve el PDF de la Constancia de Situación Fiscal guardada para la empresa.
export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const cfg = await getConfigFiscal(ctx.empresaActiva.id);
    const buf = await leerBinario(idCsf(ctx.empresaActiva.id), cfg.perfil?.csfArchivo);
    if (!buf) return fail("No hay una constancia guardada para esta empresa.", 404);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CSF-${ctx.empresaActiva.rfc}.pdf"`,
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
