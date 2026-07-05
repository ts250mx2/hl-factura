import { round2 } from "../sat/importes";
import type { CalculoRecibo, ConfigNomina, Empleado, IncidenciasEmpleado, LineaNomina } from "./tipos";
import { PERCEPCION, DEDUCCION, OTRO_PAGO, factorIntegracion } from "./catalogos";

// Motor de cálculo laboral:
//  - ISR con la tarifa mensual del Art. 96 LISR prorrateada a los días del periodo
//  - Subsidio para el empleo (monto fijo mensual con tope de ingresos, decreto vigente)
//  - Cuotas obrero-patronales IMSS (desglose por ramo) e INFONAVIT
//  - Exenciones de aguinaldo (30 UMA), prima vacacional (15 UMA) y horas extra (50%, tope 5 UMA/semana)

/** Tarifa mensual del ISR (Anexo 8 RMF, vigente 2024-2025 — actualizable). */
const TARIFA_MENSUAL: { li: number; cuota: number; pct: number }[] = [
  { li: 0.01, cuota: 0.0, pct: 0.0192 },
  { li: 746.05, cuota: 14.32, pct: 0.064 },
  { li: 6332.06, cuota: 371.83, pct: 0.1088 },
  { li: 11128.02, cuota: 893.63, pct: 0.16 },
  { li: 12935.83, cuota: 1182.88, pct: 0.1792 },
  { li: 15487.72, cuota: 1640.18, pct: 0.2136 },
  { li: 31236.5, cuota: 5004.12, pct: 0.2352 },
  { li: 49233.01, cuota: 9236.89, pct: 0.3 },
  { li: 93993.91, cuota: 22665.17, pct: 0.32 },
  { li: 125325.21, cuota: 32691.19, pct: 0.34 },
  { li: 375975.62, cuota: 117912.32, pct: 0.35 },
];

const DIAS_MES_FISCAL = 30.4;

export interface PeriodoNomina {
  inicio: string; // YYYY-MM-DD
  fin: string;
  fechaPago: string;
  dias: number; // días naturales del periodo
}

/** Valida y arma el periodo desde el cuerpo de una petición. */
export function validarPeriodo(body: Record<string, unknown>): PeriodoNomina | null {
  const inicio = String(body.periodoInicio || "");
  const fin = String(body.periodoFin || "");
  const fechaPago = String(body.fechaPago || fin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) return null;
  const dias = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 86_400_000) + 1;
  if (dias < 1 || dias > 31) return null;
  return { inicio, fin, fechaPago, dias };
}

function aniosServicio(fechaInicio: string, fechaFin: string): number {
  const ms = new Date(fechaFin).getTime() - new Date(fechaInicio).getTime();
  return Math.max(0, ms / 86_400_000 / 365);
}

/** ISR del periodo con tarifa prorrateada (método de los días del Art. 96). */
export function calcularIsr(baseGravada: number, dias: number) {
  const factor = dias / DIAS_MES_FISCAL;
  let renglon = TARIFA_MENSUAL[0];
  for (const r of TARIFA_MENSUAL) {
    if (baseGravada >= round2(r.li * factor)) renglon = r;
  }
  const liPeriodo = round2(renglon.li * factor);
  const cuotaPeriodo = round2(renglon.cuota * factor);
  const causado = round2(cuotaPeriodo + Math.max(0, baseGravada - liPeriodo) * renglon.pct);
  return { causado, tarifa: renglon.pct, cuota: cuotaPeriodo, liPeriodo };
}

/** Cuotas IMSS del trabajador (retención) por el periodo. */
export function cuotasImssObrero(sbc: number, dias: number, uma: number): number {
  const excedente = sbc > 3 * uma ? (sbc - 3 * uma) * 0.004 * dias : 0;
  const prestDinero = sbc * 0.0025 * dias;
  const gastosMedicos = sbc * 0.00375 * dias;
  const invalidezVida = sbc * 0.00625 * dias;
  const cesantiaVejez = sbc * 0.01125 * dias;
  return round2(excedente + prestDinero + gastosMedicos + invalidezVida + cesantiaVejez);
}

/** Cuotas patronales IMSS + INFONAVIT (estimación informativa del costo). */
export function cuotasPatronales(sbc: number, dias: number, uma: number, primaRiesgoPct: number) {
  const cuotaFija = 0.204 * uma * dias;
  const excedente = sbc > 3 * uma ? (sbc - 3 * uma) * 0.011 * dias : 0;
  const prestDinero = sbc * 0.007 * dias;
  const gastosMedicos = sbc * 0.0105 * dias;
  const riesgoTrabajo = sbc * (primaRiesgoPct / 100) * dias;
  const invalidezVida = sbc * 0.0175 * dias;
  const guarderias = sbc * 0.01 * dias;
  const retiro = sbc * 0.02 * dias;
  // CEAV patronal: progresiva desde 2023 según nivel salarial; se usa 3.150% promedio
  const ceav = sbc * 0.0315 * dias;
  const imss = round2(cuotaFija + excedente + prestDinero + gastosMedicos + riesgoTrabajo + invalidezVida + guarderias + retiro + ceav);
  const infonavit = round2(sbc * 0.05 * dias);
  return { imss, infonavit, total: round2(imss + infonavit) };
}

export function calcularRecibo(
  empleado: Empleado,
  config: ConfigNomina,
  periodo: PeriodoNomina,
  inc: IncidenciasEmpleado,
): CalculoRecibo {
  const uma = config.uma;
  const anios = aniosServicio(empleado.fechaInicioLaboral, periodo.fin);
  const sdi = round2(empleado.salarioDiario * factorIntegracion(Math.ceil(Math.max(anios, 0.01))));
  const sbc = round2(Math.min(sdi, 25 * uma));

  const faltas = Math.max(0, Math.floor(inc.faltas || 0));
  const diasInc = Math.max(0, Math.floor(inc.diasIncapacidad || 0));
  const diasPagados = Math.max(0, periodo.dias - faltas - diasInc);

  const percepciones: LineaNomina[] = [];
  const deducciones: LineaNomina[] = [];
  const otrosPagos: LineaNomina[] = [];

  // --- Percepciones ---
  const sueldo = round2(empleado.salarioDiario * diasPagados);
  percepciones.push({ ...PERCEPCION.SUELDO, tipo: PERCEPCION.SUELDO.tipo, clave: PERCEPCION.SUELDO.clave, concepto: PERCEPCION.SUELDO.concepto, gravado: sueldo, exento: 0 });

  let horasExtra: CalculoRecibo["horasExtra"];
  if (inc.horasExtraDobles > 0) {
    const importe = round2((empleado.salarioDiario / 8) * 2 * inc.horasExtraDobles);
    const semanas = Math.max(1, Math.ceil(periodo.dias / 7));
    const exento = round2(Math.min(importe * 0.5, 5 * uma * semanas));
    percepciones.push({ ...PERCEPCION.HORAS_EXTRA, gravado: round2(importe - exento), exento });
    horasExtra = { dias: Math.min(periodo.dias, Math.ceil(inc.horasExtraDobles / 3)), horas: inc.horasExtraDobles, importe };
  }

  if (inc.diasAguinaldo > 0) {
    const importe = round2(empleado.salarioDiario * inc.diasAguinaldo);
    const exento = round2(Math.min(importe, 30 * uma));
    percepciones.push({ ...PERCEPCION.AGUINALDO, gravado: round2(importe - exento), exento });
  }

  if (inc.pagarPrimaVacacional && inc.diasVacaciones > 0) {
    const importe = round2(empleado.salarioDiario * inc.diasVacaciones * 0.25);
    const exento = round2(Math.min(importe, 15 * uma));
    percepciones.push({ ...PERCEPCION.PRIMA_VACACIONAL, gravado: round2(importe - exento), exento });
  }

  if (inc.bono > 0) {
    percepciones.push({ ...PERCEPCION.BONO, gravado: round2(inc.bono), exento: 0 });
  }

  const totalGravado = round2(percepciones.reduce((s, p) => s + p.gravado, 0));
  const totalExento = round2(percepciones.reduce((s, p) => s + p.exento, 0));
  const totalPercepciones = round2(totalGravado + totalExento);

  // --- ISR y subsidio ---
  const isrCalc = calcularIsr(totalGravado, periodo.dias);
  const factor = periodo.dias / DIAS_MES_FISCAL;
  const baseMensualizada = factor > 0 ? totalGravado / factor : totalGravado;
  const aplicaSubsidio = baseMensualizada <= config.subsidioTopeIngresos;
  const subsidioPeriodo = aplicaSubsidio ? round2(config.subsidioMensual * factor) : 0;
  const subsidioAplicado = round2(Math.min(subsidioPeriodo, isrCalc.causado));
  const isrRetenido = round2(isrCalc.causado - subsidioAplicado);

  if (isrRetenido > 0) {
    deducciones.push({ ...DEDUCCION.ISR, gravado: isrRetenido, exento: 0 });
  }

  // --- IMSS trabajador ---
  const imssObrero = cuotasImssObrero(sbc, diasPagados, uma);
  if (imssObrero > 0) {
    deducciones.push({ ...DEDUCCION.IMSS, gravado: imssObrero, exento: 0 });
  }

  if (inc.otrasDeducciones > 0) {
    deducciones.push({
      ...DEDUCCION.OTRAS,
      concepto: inc.notaOtrasDeducciones?.trim() || DEDUCCION.OTRAS.concepto,
      gravado: round2(inc.otrasDeducciones),
      exento: 0,
    });
  }

  // --- Otros pagos: subsidio (causado, no entregado en efectivo) ---
  if (subsidioAplicado > 0) {
    otrosPagos.push({ ...OTRO_PAGO.SUBSIDIO, gravado: 0, exento: 0 });
  }

  const totalDeducciones = round2(deducciones.reduce((s, d) => s + d.gravado, 0));
  const totalOtrosPagos = round2(otrosPagos.reduce((s, o) => s + o.gravado, 0));
  const neto = round2(totalPercepciones + totalOtrosPagos - totalDeducciones);

  const patronal = cuotasPatronales(sbc, diasPagados, uma, config.primaRiesgo);

  return {
    diasPagados,
    salarioDiario: empleado.salarioDiario,
    sdi,
    sbc,
    percepciones,
    deducciones,
    otrosPagos,
    totalPercepciones,
    totalGravado,
    totalExento,
    totalDeducciones,
    totalOtrosPagos,
    neto,
    isr: {
      base: totalGravado,
      tarifa: isrCalc.tarifa,
      cuota: isrCalc.cuota,
      causado: isrCalc.causado,
      subsidio: subsidioAplicado,
      retenido: isrRetenido,
    },
    imssObrero,
    costoPatronal: patronal,
    horasExtra,
    incapacidad: diasInc > 0 ? { dias: diasInc, tipo: inc.tipoIncapacidad || "02" } : undefined,
  };
}
