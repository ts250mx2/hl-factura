import { ok, failMany } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { listarFacturas } from "@/lib/repos";
import { emitirFactura, ErrorValidacion } from "@/lib/emision";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx();
    const url = new URL(req.url);
    const emisorId = url.searchParams.get("emisorId");
    const estado = url.searchParams.get("estado") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    // Por defecto solo la empresa activa ("Trabajando en"); ?emisorId= la cambia.
    let empresaIds = ctx.empresaActiva ? [ctx.empresaActiva.id] : [];
    if (emisorId) {
      await requireEmpresa(ctx, emisorId);
      empresaIds = [emisorId];
    }
    return ok(await listarFacturas(empresaIds, { estado, q }));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    const empresa = await requireEmpresa(ctx, String(body.emisorId || ""));
    const factura = await emitirFactura(body, empresa);
    return ok(factura);
  } catch (e) {
    if (e instanceof ErrorValidacion) return failMany(e.errores);
    return authFail(e);
  }
}
