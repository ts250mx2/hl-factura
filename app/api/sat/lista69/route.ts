import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { estadoLista69 } from "@/lib/repos";
import { actualizarLista69 } from "@/lib/sat/lista69";

// El descargue del Artículo 69 baja varios CSV del SAT; puede tardar.
export const maxDuration = 180;

export async function GET() {
  try {
    await requireCtx();
    return ok(await estadoLista69());
  } catch (e) {
    return authFail(e);
  }
}

// Descarga la lista del Artículo 69 del SAT y revisa la bóveda contra ella.
export async function POST() {
  try {
    await requireCtx(["admin", "supervisor"]);
    return ok(await actualizarLista69());
  } catch (e) {
    return authFail(e);
  }
}
