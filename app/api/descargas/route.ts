import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { listarDescargas, guardarDescarga, genId } from "@/lib/repos";
import { solicitarDescarga } from "@/lib/sat/descarga";
import type { SolicitudDescarga } from "@/lib/types";

export async function GET() {
  try {
    const ctx = await requireCtx();
    return ok(await listarDescargas(ctx.empresas.map((e) => e.id)));
  } catch (e) {
    return authFail(e);
  }
}

// Presenta una solicitud de descarga masiva ante el SAT (requiere FIEL vigente).
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    const tipo = body.tipo === "recibidas" ? "recibidas" : "emitidas";
    const formato = body.formato === "metadata" ? "metadata" : "xml";
    const fechaInicio = String(body.fechaInicio || "");
    const fechaFin = String(body.fechaFin || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
      return fail("Indica el periodo con fechas válidas (AAAA-MM-DD).");
    }
    if (fechaInicio > fechaFin) return fail("La fecha inicial no puede ser posterior a la final.");

    const empresa = await requireEmpresa(ctx, String(body.emisorId || ""));
    const { requestId } = await solicitarDescarga(empresa, { tipo, formato, fechaInicio, fechaFin });

    const solicitud: SolicitudDescarga = {
      id: genId(),
      emisorId: empresa.id,
      emisorRfc: empresa.rfc,
      tipo,
      formato,
      fechaInicio,
      fechaFin,
      requestId,
      estado: "solicitada",
      mensaje: "Solicitud aceptada por el SAT. Verifica en unos minutos para ver si los paquetes están listos.",
      paquetes: [],
      creadoEl: new Date().toISOString(),
      actualizadoEl: new Date().toISOString(),
    };
    await guardarDescarga(solicitud);
    return ok(solicitud);
  } catch (e) {
    return authFail(e);
  }
}
