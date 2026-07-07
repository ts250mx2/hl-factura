import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { obtenerCartera } from "@/lib/cxc";

// Cuentas por cobrar: cartera PPD con antigüedad de saldos.
export async function GET() {
  try {
    const ctx = await requireCtx();
    // Solo la empresa activa ("Trabajando en").
    const empresaIds = ctx.empresaActiva ? [ctx.empresaActiva.id] : [];
    const cartera = await obtenerCartera(empresaIds);
    return ok(cartera);
  } catch (e) {
    return authFail(e);
  }
}
