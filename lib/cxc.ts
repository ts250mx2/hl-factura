import {
  listarFacturas,
  saldosDeFacturas,
  listarEmpresas,
  getCliente,
  getConfigSmtp,
  crearAlerta,
  existeAlerta,
} from "./repos";
import { enviarRecordatorio, smtpConfigurado } from "./correo";
import { round2 } from "./sat/importes";
import type { Factura } from "./types";

// Cuentas por cobrar: cartera de facturas PPD con saldo, clasificada por
// antigüedad respecto a su fecha de vencimiento (fecha de emisión + días de crédito).

export type BucketCxc = "al_corriente" | "por_vencer" | "vencida_30" | "vencida_60" | "vencida_mas";

export interface ItemCartera {
  factura: Factura;
  saldo: number;
  pagado: number;
  parcialidades: number;
  vencimiento: string; // YYYY-MM-DD
  diasParaVencer: number; // negativo = días vencida
  bucket: BucketCxc;
}

export interface ResumenCartera {
  totalCartera: number;
  facturas: number;
  buckets: Record<BucketCxc, { total: number; cantidad: number }>;
}

export const DIAS_CREDITO_DEFAULT = 30;

function clasificar(diasParaVencer: number): BucketCxc {
  if (diasParaVencer > 7) return "al_corriente";
  if (diasParaVencer >= 0) return "por_vencer";
  if (diasParaVencer >= -30) return "vencida_30";
  if (diasParaVencer >= -60) return "vencida_60";
  return "vencida_mas";
}

export async function obtenerCartera(empresaIds: string[]): Promise<{ items: ItemCartera[]; resumen: ResumenCartera }> {
  const facturas = (await listarFacturas(empresaIds, { estado: "timbrada" })).filter(
    (f) => f.metodoPago === "PPD",
  );
  const saldos = await saldosDeFacturas(facturas.map((f) => f.id));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const items: ItemCartera[] = [];
  for (const f of facturas) {
    const previo = saldos.get(f.id) ?? { pagado: 0, parcialidades: 0 };
    const saldo = round2(f.total - previo.pagado);
    if (saldo <= 0.005) continue; // ya está cobrada

    const dias = f.diasCredito ?? DIAS_CREDITO_DEFAULT;
    const emision = new Date(f.fecha);
    const vencimiento = new Date(emision.getFullYear(), emision.getMonth(), emision.getDate() + dias);
    const diasParaVencer = Math.round((vencimiento.getTime() - hoy.getTime()) / 86_400_000);

    items.push({
      factura: f,
      saldo,
      pagado: previo.pagado,
      parcialidades: previo.parcialidades,
      vencimiento: vencimiento.toISOString().slice(0, 10),
      diasParaVencer,
      bucket: clasificar(diasParaVencer),
    });
  }

  items.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

  const resumen: ResumenCartera = {
    totalCartera: round2(items.reduce((s, i) => s + i.saldo, 0)),
    facturas: items.length,
    buckets: {
      al_corriente: { total: 0, cantidad: 0 },
      por_vencer: { total: 0, cantidad: 0 },
      vencida_30: { total: 0, cantidad: 0 },
      vencida_60: { total: 0, cantidad: 0 },
      vencida_mas: { total: 0, cantidad: 0 },
    },
  };
  for (const i of items) {
    resumen.buckets[i.bucket].total = round2(resumen.buckets[i.bucket].total + i.saldo);
    resumen.buckets[i.bucket].cantidad++;
  }
  return { items, resumen };
}

/**
 * Recordatorios automáticos (corrida nocturna): envía un correo por factura
 * vencida con saldo, una sola vez, si el despacho lo tiene activado.
 */
export async function enviarRecordatoriosAutomaticos(despachoId: string): Promise<number> {
  const smtp = await getConfigSmtp(despachoId);
  if (!smtp.recordatoriosAuto || !smtpConfigurado(smtp)) return 0;

  const empresas = await listarEmpresas(despachoId);
  const { items } = await obtenerCartera(empresas.map((e) => e.id));
  let enviados = 0;

  for (const item of items) {
    if (item.diasParaVencer >= 0) continue; // solo vencidas
    const f = item.factura;
    if (await existeAlerta(despachoId, "cobranza", f.id)) continue; // ya se recordó
    const cliente = await getCliente(f.clienteId);
    if (!cliente?.email) continue;
    const empresa = empresas.find((e) => e.id === f.emisorId);
    if (!empresa) continue;
    try {
      await enviarRecordatorio(smtp, {
        factura: f,
        saldo: item.saldo,
        vencimiento: item.vencimiento,
        diasVencida: -item.diasParaVencer,
        empresa,
        para: cliente.email,
      });
      enviados++;
      await crearAlerta({
        despachoId,
        empresaId: f.emisorId,
        tipo: "cobranza",
        severidad: "info",
        titulo: `Recordatorio enviado a ${f.receptorNombre}`,
        detalle: `Se envió recordatorio de pago por ${item.saldo.toFixed(2)} MXN de la factura ${f.serie}-${f.folio} (vencida hace ${-item.diasParaVencer} días) a ${cliente.email}.`,
        uuid: f.id,
      });
    } catch {
      // sin SMTP disponible en este momento: se reintentará otra noche
    }
  }
  return enviados;
}
