import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { ingerirXml } from "@/lib/sat/ingesta";

// Importación manual de XMLs a la bóveda de la empresa activa
// (pasan por el mismo motor de validación fiscal que las descargas del SAT).
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    if (!ctx.empresaActiva) return fail("Primero selecciona una empresa (RFC).");

    const form = await req.formData();
    const tipo = String(form.get("tipo") || "") === "emitida" ? "emitida" : "recibida";
    const archivos = form.getAll("xml").filter((f): f is File => f instanceof File);
    if (archivos.length === 0) return fail("Adjunta al menos un archivo XML.");

    const resultados: { archivo: string; ok: boolean; uuid?: string; deducible?: string; error?: string }[] = [];
    for (const archivo of archivos) {
      try {
        const xml = Buffer.from(await archivo.arrayBuffer()).toString("utf8");
        const r = await ingerirXml(ctx.empresaActiva, tipo, xml);
        resultados.push({ archivo: archivo.name, ok: true, uuid: r.uuid, deducible: r.deducible });
      } catch (e) {
        resultados.push({ archivo: archivo.name, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return ok({ resultados });
  } catch (e) {
    return authFail(e);
  }
}
