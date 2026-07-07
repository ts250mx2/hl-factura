import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { listarDescargas, guardarDescarga, genId } from "@/lib/repos";
import { solicitarDescarga } from "@/lib/sat/descarga";
import type { SolicitudDescarga } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx();
    const url = new URL(req.url);
    const emisorId = url.searchParams.get("emisorId");

    // Por defecto solo la empresa activa ("Trabajando en"); ?emisorId= la cambia.
    let empresaIds = ctx.empresaActiva ? [ctx.empresaActiva.id] : [];
    if (emisorId) {
      await requireEmpresa(ctx, emisorId);
      empresaIds = [emisorId];
    }
    return ok(await listarDescargas(empresaIds));
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

    // Las solicitudes se presentan siempre a nombre de la empresa activa ("Trabajando en").
    const empresa = ctx.empresaActiva;
    if (!empresa) return fail("Selecciona una empresa en «Trabajando en» para presentar la solicitud.");
    if (body.emisorId && String(body.emisorId) !== empresa.id) {
      return fail("Solo puedes presentar solicitudes de la empresa activa. Cámbiala en «Trabajando en».");
    }
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
