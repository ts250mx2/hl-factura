import type { CuentaContable } from "../types";
import { round2 } from "../sat/importes";
import { listarCuentas, listarPolizas, polizasHasta } from "./repos";

// Auxiliar (mayor) de una cuenta: el saldo inicial (acumulado de periodos
// previos) y, en orden cronológico, cada movimiento del periodo que toca esa
// cuenta con su saldo corrido. Permite el drill-down balanza → auxiliar → póliza.

export interface MovimientoAuxiliar {
  polizaId: string;
  tipo: string;
  numero: number;
  fecha: string;
  concepto: string;
  origenTipo: string;
  origenId: string;
  debe: number;
  haber: number;
  saldo: number; // saldo corrido (convención deudora: saldoInicial + Σdebe − Σhaber)
}

export interface Auxiliar {
  cuenta: CuentaContable | null;
  saldoInicial: number;
  movimientos: MovimientoAuxiliar[];
  totalDebe: number;
  totalHaber: number;
  saldoFinal: number;
}

export async function calcularAuxiliar(
  empresaId: string,
  anio: string,
  mes: string,
  cuentaCodigo: string,
): Promise<Auxiliar> {
  const cuentas = await listarCuentas(empresaId);
  const cuenta = cuentas.find((c) => c.codigo === cuentaCodigo) ?? null;
  const [previas, delMes] = await Promise.all([
    polizasHasta(empresaId, anio, mes),
    listarPolizas(empresaId, anio, mes),
  ]);

  // Saldo inicial: acumulado de la cuenta en todos los periodos anteriores.
  let iniDebe = 0;
  let iniHaber = 0;
  for (const p of previas) {
    for (const m of p.movimientos) {
      if (m.cuenta !== cuentaCodigo) continue;
      iniDebe += m.debe;
      iniHaber += m.haber;
    }
  }
  const saldoInicial = round2(iniDebe - iniHaber);

  // Movimientos del periodo sobre la cuenta.
  const movimientos: MovimientoAuxiliar[] = [];
  for (const p of delMes) {
    for (const m of p.movimientos) {
      if (m.cuenta !== cuentaCodigo) continue;
      movimientos.push({
        polizaId: p.id,
        tipo: p.tipo,
        numero: p.numero,
        fecha: p.fecha,
        concepto: p.concepto,
        origenTipo: p.origenTipo,
        origenId: p.origenId,
        debe: m.debe,
        haber: m.haber,
        saldo: 0,
      });
    }
  }
  movimientos.sort((a, b) =>
    a.fecha !== b.fecha
      ? a.fecha < b.fecha
        ? -1
        : 1
      : a.tipo !== b.tipo
        ? a.tipo.localeCompare(b.tipo)
        : a.numero - b.numero,
  );

  let saldo = saldoInicial;
  let totalDebe = 0;
  let totalHaber = 0;
  for (const m of movimientos) {
    saldo = round2(saldo + m.debe - m.haber);
    m.saldo = saldo;
    totalDebe = round2(totalDebe + m.debe);
    totalHaber = round2(totalHaber + m.haber);
  }

  return { cuenta, saldoInicial, movimientos, totalDebe, totalHaber, saldoFinal: round2(saldoInicial + totalDebe - totalHaber) };
}
