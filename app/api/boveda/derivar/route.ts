import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { derivarBovedaExistente } from "@/lib/sat/derivar";

// Vuelve a derivar los CFDI ya guardados en la bóveda de la empresa activa hacia
// las páginas de operación (clientes/proveedores, productos, facturas, pagos).
export async function POST() {
  try {
    const ctx = await requireCtx();
    if (!ctx.empresaActiva) return fail("Selecciona una empresa en 'Trabajando en'.");
    const r = await derivarBovedaExistente(ctx.empresaActiva);
    return ok(r);
  } catch (e) {
    return authFail(e);
  }
}
