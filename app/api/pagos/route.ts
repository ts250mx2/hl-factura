import { ok, failMany } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { listarPagosRep } from "@/lib/repos";
import { emitirPago } from "@/lib/emision-pago";
import { ErrorValidacion } from "@/lib/emision";

export async function GET() {
  try {
    const ctx = await requireCtx();
    // Solo la empresa activa ("Trabajando en").
    const empresaIds = ctx.empresaActiva ? [ctx.empresaActiva.id] : [];
    return ok(await listarPagosRep(empresaIds));
  } catch (e) {
    return authFail(e);
  }
}

// Emite un complemento de recepción de pagos (REP 2.0)
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    const empresa = await requireEmpresa(ctx, String(body.emisorId || ctx.empresaActiva?.id || ""));
    const pago = await emitirPago(body, empresa);
    return ok(pago);
  } catch (e) {
    if (e instanceof ErrorValidacion) return failMany(e.errores);
    return authFail(e);
  }
}
