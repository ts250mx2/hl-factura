import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { estadoEfos } from "@/lib/repos";
import { actualizarListaEfos } from "@/lib/sat/efos";

export async function GET() {
  try {
    await requireCtx();
    return ok(await estadoEfos());
  } catch (e) {
    return authFail(e);
  }
}

// Descarga la lista 69-B completa del SAT y re-evalúa la bóveda.
export async function POST() {
  try {
    await requireCtx(["admin", "supervisor"]);
    const r = await actualizarListaEfos();
    return ok(r);
  } catch (e) {
    return authFail(e);
  }
}
