import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { obtenerCartera } from "@/lib/cxc";

// Cuentas por cobrar: cartera PPD con antigüedad de saldos.
export async function GET() {
  try {
    const ctx = await requireCtx();
    const cartera = await obtenerCartera(ctx.empresas.map((e) => e.id));
    return ok(cartera);
  } catch (e) {
    return authFail(e);
  }
}
