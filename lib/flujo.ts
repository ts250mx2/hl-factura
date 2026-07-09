import type { Emisor } from "./types";
import { obtenerCartera } from "./cxc";
import { listarCxp } from "./repos";
import { calcularPanelFiscal } from "./contabilidad/fiscal";
import { round2 } from "./sat/importes";

// Proyección de flujo de efectivo: cruza lo que se espera cobrar (cartera CxC por
// fecha de vencimiento), lo que se debe pagar (CxP programado/pendiente) y los
// impuestos por enterar (panel fiscal, con vencimiento el día 17), en cubetas
// semanales, para anticipar en qué semana el saldo podría quedar en rojo.

export interface MovimientoFlujo {
  fecha: string; // YYYY-MM-DD
  tipo: "cobro" | "pago" | "impuesto";
  concepto: string;
  monto: number; // positivo = entra, negativo = sale
  vencido?: boolean; // el cobro/pago ya venció y se reprograma a "ahora"
}

export interface SemanaFlujo {
  indice: number;
  inicio: string;
  fin: string;
  entradas: number;
  salidas: number;
  neto: number;
  saldoFinal: number;
  movimientos: MovimientoFlujo[];
}

export interface ProyeccionFlujo {
  saldoInicial: number;
  desde: string;
  hasta: string;
  semanas: SemanaFlujo[];
  totalEntradas: number;
  totalSalidas: number;
  saldoFinal: number;
  minSaldo: number;
  minSemanaInicio: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export async function proyectarFlujo(
  empresa: Emisor,
  saldoInicial: number,
  semanas: number,
): Promise<ProyeccionFlujo> {
  const n = Math.min(Math.max(Math.trunc(semanas) || 8, 1), 26);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hasta = addDays(hoy, n * 7);

  // Cubetas semanales [inicio, fin).
  const cubetas: SemanaFlujo[] = [];
  for (let i = 0; i < n; i++) {
    const inicio = addDays(hoy, i * 7);
    cubetas.push({ indice: i, inicio: iso(inicio), fin: iso(addDays(inicio, 7)), entradas: 0, salidas: 0, neto: 0, saldoFinal: 0, movimientos: [] });
  }
  // Índice de la semana que contiene una fecha (o null si cae fuera del rango).
  const semanaDe = (fecha: string): number | null => {
    const idx = Math.floor((new Date(`${fecha}T00:00:00`).getTime() - hoy.getTime()) / (7 * 86_400_000));
    return idx >= 0 && idx < n ? idx : null;
  };
  const colocar = (fechaObjetivo: string, mov: MovimientoFlujo) => {
    const idx = semanaDe(fechaObjetivo);
    if (idx === null) return;
    cubetas[idx].movimientos.push(mov);
    if (mov.monto >= 0) cubetas[idx].entradas = round2(cubetas[idx].entradas + mov.monto);
    else cubetas[idx].salidas = round2(cubetas[idx].salidas - mov.monto);
  };

  // 1) Cobros esperados (cartera PPD). Los ya vencidos se reprograman a "hoy".
  const { items } = await obtenerCartera([empresa.id]);
  for (const it of items) {
    const vencido = it.vencimiento < iso(hoy);
    const fecha = vencido ? iso(hoy) : it.vencimiento;
    colocar(fecha, {
      fecha,
      tipo: "cobro",
      concepto: `Cobro ${it.factura.serie}-${it.factura.folio} · ${it.factura.receptorNombre}`,
      monto: it.saldo,
      vencido,
    });
  }

  // 2) Pagos a proveedores (CxP no pagadas ni canceladas). Las notas de crédito
  //    recibidas (tipoComprobante "E") REDUCEN lo que se debe: entran con signo
  //    positivo (menos salida), no como un pago adicional.
  const cxp = await listarCxp([empresa.id]);
  for (const c of cxp) {
    if (c.estadoPago === "pagada" || c.estatusSat === "cancelado") continue;
    const esNotaCredito = c.tipoComprobante === "E";
    const base = c.fechaProgramada && /^\d{4}-\d{2}-\d{2}$/.test(c.fechaProgramada) ? c.fechaProgramada : c.fecha.slice(0, 10);
    const vencido = base < iso(hoy);
    const fecha = vencido ? iso(hoy) : base;
    colocar(fecha, {
      fecha,
      tipo: "pago",
      concepto: `${esNotaCredito ? "Nota de crédito de " : "Pago "}${c.emisorNombre || c.emisorRfc}`,
      monto: esNotaCredito ? c.total : -c.total,
      vencido,
    });
  }

  // 3) Impuestos por enterar: para cada mes cuyo día 17 cae en la ventana, se
  //    toma lo "a cargo" del panel fiscal del mes anterior (actividad ya devengada).
  //    Se incluye siempre el mes en curso: si su día 17 ya pasó y no se ha pagado,
  //    ese impuesto está vencido y se reprograma a hoy (igual que cobros y pagos).
  const meses = new Set<string>([`${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}`]);
  for (let d = new Date(hoy); d < hasta; d = addDays(d, 1)) {
    if (d.getDate() === 17) meses.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  for (const ym of meses) {
    const [anioV, mesV] = ym.split("-").map(Number);
    // El pago del día 17 de mesV corresponde a la actividad del mes anterior.
    const prev = mesV === 1 ? { a: anioV - 1, m: 12 } : { a: anioV, m: mesV - 1 };
    try {
      const panel = await calcularPanelFiscal(empresa, String(prev.a), pad(prev.m));
      const aCargo = round2(
        panel.conceptos.filter((c) => c.periodicidad === "mensual" && c.aCargo > 0).reduce((s, c) => s + c.aCargo, 0),
      );
      if (aCargo > 0) {
        const limite = `${anioV}-${pad(mesV)}-17`;
        const vencido = limite < iso(hoy);
        const fecha = vencido ? iso(hoy) : limite;
        colocar(fecha, {
          fecha,
          tipo: "impuesto",
          concepto: `Impuestos ${pad(prev.m)}/${prev.a} (estimado del panel fiscal)`,
          monto: -aCargo,
          vencido,
        });
      }
    } catch {
      /* sin datos suficientes para estimar impuestos de ese mes */
    }
  }

  // Saldo corrido y punto más bajo.
  let saldo = round2(saldoInicial);
  let minSaldo = saldo;
  let minSemanaInicio: string | null = null;
  let totalEntradas = 0;
  let totalSalidas = 0;
  for (const s of cubetas) {
    s.movimientos.sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : b.monto - a.monto));
    s.neto = round2(s.entradas - s.salidas);
    saldo = round2(saldo + s.neto);
    s.saldoFinal = saldo;
    totalEntradas = round2(totalEntradas + s.entradas);
    totalSalidas = round2(totalSalidas + s.salidas);
    if (saldo < minSaldo) {
      minSaldo = saldo;
      minSemanaInicio = s.inicio;
    }
  }

  return {
    saldoInicial: round2(saldoInicial),
    desde: iso(hoy),
    hasta: iso(hasta),
    semanas: cubetas,
    totalEntradas,
    totalSalidas,
    saldoFinal: saldo,
    minSaldo,
    minSemanaInicio,
  };
}
