import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura, eliminarFactura, getCliente } from "@/lib/repos";
import { leerXml, eliminarArchivo, idEmitido } from "@/lib/archivos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const factura = await getFactura(id);
    if (!factura) return fail("Factura no encontrada", 404);
    const empresa = await requireEmpresa(ctx, factura.emisorId);
    const xml = await leerXml(idEmitido("factura", factura.id), factura.xmlPath);
    const cliente = await getCliente(factura.clienteId);
    return ok({
      factura,
      xml,
      emisor: {
        rfc: empresa.rfc,
        nombre: empresa.nombre,
        regimenFiscal: empresa.regimenFiscal,
        codigoPostal: empresa.codigoPostal,
      },
      cliente: cliente
        ? {
            rfc: cliente.rfc,
            nombre: cliente.nombre,
            regimenFiscal: cliente.regimenFiscal,
            codigoPostal: cliente.codigoPostal,
            email: cliente.email,
          }
        : null,
    });
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const factura = await getFactura(id);
    if (!factura) return fail("Factura no encontrada", 404);
    await requireEmpresa(ctx, factura.emisorId);
    if (factura.estado === "timbrada") {
      return fail("Una factura timbrada no se elimina: debe cancelarse ante el SAT.");
    }
    await eliminarFactura(id);
    await eliminarArchivo(idEmitido("factura", factura.id));
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
