import fs from "fs";
import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getDescarga } from "@/lib/repos";
import { leerPaquete } from "@/lib/sat/descarga";

type Params = { params: Promise<{ id: string }> };

// Lee el contenido de los paquetes ZIP ya descargados (lista de CFDI o metadata).
export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const solicitud = await getDescarga(id);
    if (!solicitud) return fail("Solicitud no encontrada", 404);
    await requireEmpresa(ctx, solicitud.emisorId);

    const archivos: { nombre: string; contenido?: string }[] = [];
    const metadata: Record<string, string>[] = [];
    for (const paquete of solicitud.paquetes) {
      if (!paquete.zipPath || !fs.existsSync(paquete.zipPath)) continue;
      const contenido = await leerPaquete(paquete.zipPath, solicitud.formato);
      archivos.push(...contenido.archivos);
      metadata.push(...contenido.metadata);
    }
    return ok({ formato: solicitud.formato, archivos, metadata });
  } catch (e) {
    return authFail(e);
  }
}
