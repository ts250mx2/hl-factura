import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { listarCxp, upsertCxp } from "@/lib/repos";

// Cuentas por pagar: CFDI recibidos (desde la bóveda) con su estado de pago.
export async function GET() {
  try {
    const ctx = await requireCtx();
    return ok(await listarCxp(ctx.empresas.map((e) => e.id)));
  } catch (e) {
    return authFail(e);
  }
}

// Programa o marca como pagado un CFDI recibido.
export async function PUT(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    const uuid = String(body.uuid || "").toUpperCase();
    const empresaId = String(body.empresaId || "");
    const estadoPago = String(body.estadoPago || "");
    if (!uuid) return fail("Falta el UUID.");
    if (!["pendiente", "programada", "pagada"].includes(estadoPago)) return fail("Estado de pago inválido.");
    await requireEmpresa(ctx, empresaId);

    const fechaProgramada = String(body.fechaProgramada || "").trim();
    await upsertCxp({
      uuid,
      empresaId,
      estadoPago: estadoPago as "pendiente" | "programada" | "pagada",
      fechaProgramada: /^\d{4}-\d{2}-\d{2}$/.test(fechaProgramada) ? fechaProgramada : undefined,
      nota: String(body.nota || "").trim() || undefined,
      actualizadoEl: new Date().toISOString(),
    });
    return ok({ hecho: true });
  } catch (e) {
    return authFail(e);
  }
}
