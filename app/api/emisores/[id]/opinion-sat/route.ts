import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getEmpresa } from "@/lib/repos";
import { descargarOpinionConFiel } from "@/lib/sat/opinion-descarga";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";
import { guardarArchivo, idOpinion } from "@/lib/archivos";
import type { OpinionCumplimiento } from "@/lib/types";

// BETA — Descarga la Opinión de Cumplimiento (32-D) del SAT con la FIEL de la
// empresa; guarda el PDF y registra el sentido (positiva/negativa) con su fecha.

// El flujo contra el SAT hace varias peticiones y puede tardar más de un minuto.
export const maxDuration = 180;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const { id } = await params;
    const emisor = await getEmpresa(id);
    if (!emisor || emisor.despachoId !== ctx.despachoId) return fail("Empresa no encontrada.", 404);
    if (!emisor.fiel) return fail("Esta empresa no tiene FIEL (e.firma) cargada. Súbela primero.");

    const url = new URL(req.url);
    const entrada = url.searchParams.get("entrada") || undefined; // override para afinar (solo *.sat.gob.mx)

    const r = await descargarOpinionConFiel(emisor, entrada);

    if (r.ok && r.pdf) {
      await guardarArchivo(idOpinion(emisor.id), "opinion", "application/pdf", `Opinion-32D-${emisor.rfc}.pdf`, r.pdf, emisor.id);
      const opinion: OpinionCumplimiento = {
        sentido: r.sentido ?? "desconocido",
        fecha: new Date().toISOString(),
        folio: r.folio,
      };
      const cfg = await getConfigFiscal(emisor.id);
      await guardarConfigFiscal(emisor.id, { ...cfg, opinion32d: opinion });
      return ok({ ok: true, guardado: true, opinion, pasos: r.pasos });
    }

    // Rastro completo en los logs del servidor (única ventana en producción).
    console.error(`[opinion-sat] ${emisor.rfc}: ${r.error}`);
    for (const p of r.pasos) {
      console.error(`[opinion-sat]   ${p.paso} · ${p.status ?? "-"} · ${p.url ?? ""} · ${p.detalle ?? ""}`);
    }
    return ok({ ok: false, error: r.error, pasos: r.pasos });
  } catch (e) {
    return authFail(e);
  }
}
