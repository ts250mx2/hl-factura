import { ok, fail, errorMessage } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getDescarga, guardarDescarga } from "@/lib/repos";
import { descargarPaquete } from "@/lib/sat/descarga";
import { ingerirSolicitud } from "@/lib/sat/ingesta";

type Params = { params: Promise<{ id: string }> };

// Descarga todos los paquetes pendientes de una solicitud lista.
export async function POST(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const solicitud = await getDescarga(id);
    if (!solicitud) return fail("Solicitud no encontrada", 404);
    if (solicitud.estado !== "lista" && solicitud.estado !== "descargada") {
      return fail("La solicitud aún no está lista para descargar.");
    }
    const empresa = await requireEmpresa(ctx, solicitud.emisorId);

    const errores: { id: string; error: string }[] = [];
    for (const paquete of solicitud.paquetes) {
      if (paquete.descargado && paquete.zipPath) continue;
      try {
        paquete.zipPath = await descargarPaquete(empresa, paquete.id);
        paquete.descargado = true;
      } catch (e) {
        errores.push({ id: paquete.id, error: errorMessage(e) });
      }
    }
    if (solicitud.paquetes.every((p) => p.descargado)) solicitud.estado = "descargada";
    solicitud.actualizadoEl = new Date().toISOString();
    await guardarDescarga(solicitud);

    // Ingesta automática a la bóveda (con validación EFOS y deducibilidad)
    let ingesta = null;
    if (solicitud.estado === "descargada" && !solicitud.ingerida) {
      try {
        ingesta = await ingerirSolicitud(empresa, solicitud);
      } catch (e) {
        errores.push({ id: "ingesta", error: errorMessage(e) });
      }
    }

    return ok({ solicitud, errores, ingesta });
  } catch (e) {
    return authFail(e);
  }
}
