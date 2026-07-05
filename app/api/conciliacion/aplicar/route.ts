import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getFactura } from "@/lib/repos";
import { emitirPago } from "@/lib/emision-pago";
import { ErrorValidacion } from "@/lib/emision";
import { registrarConciliacion, type MovimientoBanco } from "@/lib/conciliacion";
import { saldosDeFacturas } from "@/lib/repos";
import { round2 } from "@/lib/sat/importes";

// Aplica un depósito conciliado: genera el REP con la fecha real del depósito
// y registra el movimiento para no volver a ofrecerlo.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const mov: MovimientoBanco = {
      fecha: String(body.fecha || ""),
      referencia: String(body.referencia || ""),
      monto: Number(body.monto),
    };
    const facturaId = String(body.facturaId || "");
    if (!Number.isFinite(mov.monto) || mov.monto <= 0) return fail("Monto del depósito inválido.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mov.fecha)) {
      return fail("La fecha del depósito no se pudo interpretar; corrígela antes de aplicar (AAAA-MM-DD).");
    }

    const factura = await getFactura(facturaId);
    if (!factura || factura.emisorId !== ctx.empresaActiva.id) return fail("Factura no encontrada", 404);

    const saldos = await saldosDeFacturas([facturaId]);
    const previo = saldos.get(facturaId) ?? { pagado: 0, parcialidades: 0 };
    const saldo = round2(factura.total - previo.pagado);
    const pagado = round2(Math.min(mov.monto, saldo));
    if (pagado <= 0) return fail("La factura ya no tiene saldo.");

    const pago = await emitirPago(
      {
        clienteId: factura.clienteId,
        fechaPago: mov.fecha,
        formaPago: "03", // transferencia (depósito bancario)
        doctos: [{ facturaId, pagado }],
      },
      ctx.empresaActiva,
    );

    if (pago.estado === "timbrada") {
      await registrarConciliacion(ctx.empresaActiva.id, mov, facturaId, pago.id);
    }
    return ok({
      pago,
      aplicado: pagado,
      sobrante: round2(mov.monto - pagado),
    });
  } catch (e) {
    if (e instanceof ErrorValidacion) return failMany(e.errores);
    return authFail(e);
  }
}
