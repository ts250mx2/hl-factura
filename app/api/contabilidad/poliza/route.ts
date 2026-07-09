import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getPoliza } from "@/lib/contabilidad/repos";
import type { Poliza } from "@/lib/types";

// Detalle de una póliza con el enlace a su documento de origen (drill-down).
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") || "");
    if (!id) return fail("Indica la póliza.");
    const poliza = await getPoliza(ctx.empresaActiva.id, id);
    if (!poliza) return fail("Póliza no encontrada.", 404);
    return ok({ poliza, origen: origenLink(poliza) });
  } catch (e) {
    return authFail(e);
  }
}

/** Enlace navegable al documento que originó la póliza, según su origen. */
function origenLink(p: Poliza): { tipo: string; id: string; href?: string; label: string } {
  switch (p.origenTipo) {
    case "factura":
      return { tipo: "factura", id: p.origenId, href: `/facturas/${p.origenId}`, label: "Ver factura" };
    case "pago":
      return { tipo: "pago", id: p.origenId, href: "/pagos", label: "Ver en Pagos (REP)" };
    case "gasto":
      // origenId es el UUID del CFDI recibido (bóveda / cuentas por pagar).
      return { tipo: "gasto", id: p.origenId, href: "/cxp", label: "Ver en Cuentas por pagar" };
    case "depreciacion":
      return { tipo: "depreciacion", id: p.origenId, label: "Depreciación de activo fijo" };
    default:
      return { tipo: "manual", id: p.origenId, label: "Póliza manual" };
  }
}
