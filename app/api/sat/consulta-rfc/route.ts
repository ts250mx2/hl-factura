import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { buscarEfos } from "@/lib/repos";
import { consultarLista69 } from "@/lib/sat/lista69";
import { validarRfc } from "@/lib/sat/rfc";

// Consulta un RFC contra las listas negras del SAT ya descargadas (69-B/EFOS y
// Artículo 69). No llama al SAT en vivo: cruza contra los datos locales.
export async function GET(req: Request) {
  try {
    await requireCtx();
    const url = new URL(req.url);
    const rfc = String(url.searchParams.get("rfc") || "").trim().toUpperCase();
    if (!validarRfc(rfc).valido) return fail("RFC inválido.");
    const [efosMap, lista69] = await Promise.all([buscarEfos([rfc]), consultarLista69(rfc)]);
    return ok({
      rfc,
      efos: efosMap.get(rfc) ?? null, // "Presunto" | "Definitivo" | "Desvirtuado" | "Sentencia Favorable" | null
      lista69, // categorías del Artículo 69 (vacío si no aparece)
    });
  } catch (e) {
    return authFail(e);
  }
}
