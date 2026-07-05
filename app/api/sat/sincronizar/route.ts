import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getConfigSync, listarSyncs } from "@/lib/repos";
import { ejecutarSincronizacion, procesarPendientes } from "@/lib/sat/sincronizador";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const [config, registros] = await Promise.all([
      getConfigSync(ctx.despachoId),
      listarSyncs(ctx.despachoId),
    ]);
    return ok({ config, registros });
  } catch (e) {
    return authFail(e);
  }
}

// "Sincronizar ahora": presenta solicitudes y da un primer avance a pendientes.
export async function POST() {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const resultado = await ejecutarSincronizacion(ctx.despachoId, { manual: true });
    const avance = await procesarPendientes();
    return ok({ ...resultado, avance });
  } catch (e) {
    return authFail(e);
  }
}
