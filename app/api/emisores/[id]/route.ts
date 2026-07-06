import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { actualizarEmpresa, eliminarEmpresa, listarFacturas, certificadoPublico } from "@/lib/repos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const empresa = await requireEmpresa(ctx, id);
    return ok({
      ...empresa,
      csd: certificadoPublico(empresa.csd),
      fiel: certificadoPublico(empresa.fiel),
    });
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const { id } = await params;
    const empresa = await requireEmpresa(ctx, id);
    const body = await req.json();
    if (typeof body.nombre === "string" && body.nombre.trim()) empresa.nombre = body.nombre.trim();
    if (typeof body.regimenFiscal === "string" && body.regimenFiscal) empresa.regimenFiscal = body.regimenFiscal;
    if (typeof body.codigoPostal === "string" && /^\d{5}$/.test(body.codigoPostal)) {
      empresa.codigoPostal = body.codigoPostal;
    }
    if (typeof body.serie === "string" && body.serie.trim()) empresa.serie = body.serie.trim().toUpperCase();
    if (Number.isInteger(body.folioActual) && body.folioActual > 0) empresa.folioActual = body.folioActual;
    await actualizarEmpresa(empresa);
    return ok(empresa);
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin"]);
    const { id } = await params;
    await requireEmpresa(ctx, id);
    if ((await listarFacturas([id], { estado: "timbrada" })).length > 0) {
      return fail("No se puede eliminar: esta empresa tiene facturas timbradas. Conserva su historial.");
    }
    await eliminarEmpresa(id);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
