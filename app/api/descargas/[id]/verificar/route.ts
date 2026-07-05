import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getDescarga, guardarDescarga } from "@/lib/repos";
import { verificarDescarga } from "@/lib/sat/descarga";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const solicitud = await getDescarga(id);
    if (!solicitud || !solicitud.requestId) return fail("Solicitud no encontrada", 404);
    const empresa = await requireEmpresa(ctx, solicitud.emisorId);

    const estado = await verificarDescarga(empresa, solicitud.requestId);

    solicitud.mensaje = estado.mensaje;
    solicitud.actualizadoEl = new Date().toISOString();
    if (estado.fallida) solicitud.estado = "rechazada";
    else if (estado.terminada) {
      solicitud.estado = "lista";
      solicitud.paquetes = estado.paquetes.map((pid) => {
        const existente = solicitud.paquetes.find((p) => p.id === pid);
        return existente ?? { id: pid, descargado: false };
      });
    } else solicitud.estado = "en_proceso";
    await guardarDescarga(solicitud);
    return ok(solicitud);
  } catch (e) {
    return authFail(e);
  }
}
