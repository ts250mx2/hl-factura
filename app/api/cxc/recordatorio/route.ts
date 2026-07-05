import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { getFactura, getCliente, getConfigSmtp, crearAlerta } from "@/lib/repos";
import { obtenerCartera } from "@/lib/cxc";
import { enviarRecordatorio } from "@/lib/correo";

// Envía manualmente un recordatorio de cobranza por correo.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    const facturaId = String(body.facturaId || "");
    const factura = await getFactura(facturaId);
    if (!factura) return fail("Factura no encontrada", 404);
    const empresa = await requireEmpresa(ctx, factura.emisorId);

    const cliente = await getCliente(factura.clienteId);
    const para = String(body.para || cliente?.email || "").trim();
    if (!para) return fail("El cliente no tiene correo registrado; agrégalo en Clientes o indícalo aquí.");

    const { items } = await obtenerCartera([empresa.id]);
    const item = items.find((i) => i.factura.id === facturaId);
    if (!item) return fail("Esta factura ya no tiene saldo pendiente.");

    const smtp = await getConfigSmtp(ctx.despachoId);
    await enviarRecordatorio(smtp, {
      factura,
      saldo: item.saldo,
      vencimiento: item.vencimiento,
      diasVencida: -item.diasParaVencer,
      empresa,
      para,
    });

    await crearAlerta({
      despachoId: ctx.despachoId,
      empresaId: empresa.id,
      tipo: "cobranza",
      severidad: "info",
      titulo: `Recordatorio enviado a ${factura.receptorNombre}`,
      detalle: `Recordatorio manual de la factura ${factura.serie}-${factura.folio} (saldo $${item.saldo.toFixed(2)}) enviado a ${para}.`,
      uuid: factura.id,
    });
    return ok({ enviado: true, para });
  } catch (e) {
    return authFail(e);
  }
}
