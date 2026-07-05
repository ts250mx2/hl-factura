import type { CuentaContable } from "../types";
import { round2 } from "../sat/importes";
import { listarCuentas, listarPolizas, polizasHasta } from "./repos";

// Balanza de comprobación: saldo inicial (acumulado de periodos previos),
// cargos y abonos del mes, y saldo final por cuenta.

export interface RenglonBalanza {
  cuenta: CuentaContable;
  saldoInicial: number; // convención deudora: debe - haber
  debe: number;
  haber: number;
  saldoFinal: number;
}

export interface Balanza {
  renglones: RenglonBalanza[];
  totalDebe: number;
  totalHaber: number;
  cuadrada: boolean;
}

export async function calcularBalanza(empresaId: string, anio: string, mes: string): Promise<Balanza> {
  const cuentas = await listarCuentas(empresaId);
  const previas = await polizasHasta(empresaId, anio, mes);
  const delMes = await listarPolizas(empresaId, anio, mes);

  const acumulado = new Map<string, { debe: number; haber: number }>();
  const periodo = new Map<string, { debe: number; haber: number }>();
  const suma = (mapa: Map<string, { debe: number; haber: number }>, cuenta: string, debe: number, haber: number) => {
    const x = mapa.get(cuenta) ?? { debe: 0, haber: 0 };
    x.debe = round2(x.debe + debe);
    x.haber = round2(x.haber + haber);
    mapa.set(cuenta, x);
  };
  for (const p of previas) for (const m of p.movimientos) suma(acumulado, m.cuenta, m.debe, m.haber);
  for (const p of delMes) for (const m of p.movimientos) suma(periodo, m.cuenta, m.debe, m.haber);

  const renglones: RenglonBalanza[] = [];
  const codigos = new Set([...acumulado.keys(), ...periodo.keys()]);
  for (const cuenta of cuentas) {
    if (!codigos.has(cuenta.codigo)) continue;
    const ini = acumulado.get(cuenta.codigo) ?? { debe: 0, haber: 0 };
    const mesMov = periodo.get(cuenta.codigo) ?? { debe: 0, haber: 0 };
    const saldoInicial = round2(ini.debe - ini.haber);
    renglones.push({
      cuenta,
      saldoInicial,
      debe: mesMov.debe,
      haber: mesMov.haber,
      saldoFinal: round2(saldoInicial + mesMov.debe - mesMov.haber),
    });
  }
  // Cuentas con movimientos pero fuera del catálogo (no debería pasar)
  for (const codigo of codigos) {
    if (cuentas.some((c) => c.codigo === codigo)) continue;
    const ini = acumulado.get(codigo) ?? { debe: 0, haber: 0 };
    const mesMov = periodo.get(codigo) ?? { debe: 0, haber: 0 };
    renglones.push({
      cuenta: { empresaId, codigo, nombre: `(fuera de catálogo) ${codigo}`, codigoAgrupador: "", naturaleza: "D", nivel: 2 },
      saldoInicial: round2(ini.debe - ini.haber),
      debe: mesMov.debe,
      haber: mesMov.haber,
      saldoFinal: round2(ini.debe - ini.haber + mesMov.debe - mesMov.haber),
    });
  }

  const totalDebe = round2(renglones.reduce((s, r) => s + r.debe, 0));
  const totalHaber = round2(renglones.reduce((s, r) => s + r.haber, 0));
  return { renglones, totalDebe, totalHaber, cuadrada: Math.abs(totalDebe - totalHaber) < 0.01 };
}
