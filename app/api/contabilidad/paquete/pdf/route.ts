import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getDespacho } from "@/lib/repos";
import { armarPaquete } from "@/lib/contabilidad/paquete";
import { generarPaquetePdf } from "@/lib/pdf/paquete-pdf";

// El ensamblado del paquete corre varios cálculos; da margen.
export const maxDuration = 120;

// Descarga el reporte mensual del cliente en PDF (empresa activa).
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");

    const [data, despacho] = await Promise.all([armarPaquete(ctx.empresaActiva, anio, mes), getDespacho(ctx.despachoId)]);
    const pdf = await generarPaquetePdf(data, ctx.empresaActiva, despacho?.nombre);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Reporte-${ctx.empresaActiva.rfc}-${anio}-${mes}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
