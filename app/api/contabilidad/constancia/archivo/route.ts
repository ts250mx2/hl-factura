import fs from "fs";
import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getConfigFiscal } from "@/lib/contabilidad/repos";

// Devuelve el PDF de la Constancia de Situación Fiscal guardada para la empresa.
export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const cfg = await getConfigFiscal(ctx.empresaActiva.id);
    const ruta = cfg.perfil?.csfArchivo;
    if (!ruta || !fs.existsSync(ruta)) return fail("No hay una constancia guardada para esta empresa.", 404);
    const buf = fs.readFileSync(ruta);
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
