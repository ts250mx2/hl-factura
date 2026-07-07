import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getEmpresa } from "@/lib/repos";
import { descargarCsfConFiel } from "@/lib/sat/csf-descarga";
import { parsearConstancia } from "@/lib/sat/constancia";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";
import { guardarArchivo, idCsf } from "@/lib/archivos";

// BETA — Descarga la CSF del SAT usando la FIEL de la empresa y, si lo logra,
// la guarda y actualiza el perfil fiscal (régimen + obligaciones).

// El flujo completo contra el SAT hace ~15 peticiones y puede tardar más de un
// minuto; sin esto, algunos despliegues cortan la ruta antes de terminar.
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

    const r = await descargarCsfConFiel(emisor, entrada);

    if (r.ok && r.pdf) {
      await guardarArchivo(idCsf(emisor.id), "csf", "application/pdf", `${emisor.rfc}.pdf`, r.pdf, emisor.id);
      let obligaciones = 0;
      let regimenes = 0;
      try {
        const perfil = await parsearConstancia(r.pdf);
        perfil.csfArchivo = idCsf(emisor.id);
        perfil.importadaEl = new Date().toISOString();
        perfil.fuente = "csf";
        const cfg = await getConfigFiscal(emisor.id);
        await guardarConfigFiscal(emisor.id, { ...cfg, perfil });
        obligaciones = perfil.obligaciones.length;
        regimenes = perfil.regimenes.length;
      } catch {
        /* el PDF se guardó aunque no se haya podido parsear */
      }
      return ok({ ok: true, guardado: true, regimenes, obligaciones, pasos: r.pasos });
    }

    // Deja el rastro completo en los logs del servidor: en producción es la
    // única forma de ver en qué paso se quedó el flujo con el SAT.
    console.error(`[csf-sat] ${emisor.rfc}: ${r.error}`);
    for (const p of r.pasos) {
      console.error(`[csf-sat]   ${p.paso} · ${p.status ?? "-"} · ${p.url ?? ""} · ${p.detalle ?? ""}`);
    }
    return ok({ ok: false, error: r.error, pasos: r.pasos });
  } catch (e) {
    return authFail(e);
  }
}
