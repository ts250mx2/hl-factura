import { round2 } from "../sat/importes";
import { calcularBalanza } from "./balanza";

// Estados financieros derivados de la balanza acumulada (saldos a la fecha de
// corte). El estado de resultados es acumulado a la fecha; el estado de
// situación financiera es la fotografía de saldos al cierre del periodo.
// Clasificación por el código agrupador del SAT (Anexo 24):
//   1xx Activo · 2xx Pasivo · 3xx Capital · 4xx Ingresos · 5xx Costos · 6xx Gastos · 7xx Otros

export interface LineaEstado {
  codigo: string;
  nombre: string;
  importe: number;
}

export interface GrupoEstado {
  titulo: string;
  lineas: LineaEstado[];
  total: number;
}

export interface EstadoResultados {
  periodo: { anio: string; mes: string };
  ingresos: GrupoEstado; // ventas netas (ingresos − devoluciones/descuentos)
  costos: GrupoEstado;
  utilidadBruta: number;
  gastos: GrupoEstado;
  utilidadOperacion: number;
  otros: GrupoEstado; // otros ingresos/gastos (7xx)
  utilidadNeta: number; // resultado antes de impuestos
}

export interface SituacionFinanciera {
  corte: { anio: string; mes: string };
  activoCirculante: GrupoEstado;
  activoNoCirculante: GrupoEstado;
  totalActivo: number;
  pasivoCortoPlazo: GrupoEstado;
  pasivoLargoPlazo: GrupoEstado;
  totalPasivo: number;
  capitalContable: GrupoEstado;
  resultadoEjercicio: number;
  totalCapital: number;
  totalPasivoMasCapital: number;
  diferencia: number; // debería ser ~0 si la contabilidad está cuadrada
}

export interface EstadosFinancieros {
  resultados: EstadoResultados;
  situacion: SituacionFinanciera;
  cuadrada: boolean;
}

/** Número de grupo mayor del agrupador (o del código) — ej. "601.84" → 601. */
function grupoMayor(agrupador: string, codigo: string): number {
  const base = (agrupador || codigo || "").split(".")[0].replace(/\D/g, "");
  return Number(base) || 0;
}

function nuevoGrupo(titulo: string): GrupoEstado {
  return { titulo, lineas: [], total: 0 };
}

function agregar(g: GrupoEstado, codigo: string, nombre: string, importe: number) {
  if (Math.abs(importe) < 0.005) return;
  g.lineas.push({ codigo, nombre, importe: round2(importe) });
  g.total = round2(g.total + importe);
}

export async function estadosFinancieros(empresaId: string, anio: string, mes: string): Promise<EstadosFinancieros> {
  const balanza = await calcularBalanza(empresaId, anio, mes);

  // --- Estado de resultados ---
  const ingresos = nuevoGrupo("Ingresos netos");
  const costos = nuevoGrupo("Costo de ventas");
  const gastos = nuevoGrupo("Gastos de operación");
  const otros = nuevoGrupo("Otros ingresos y gastos");

  // --- Estado de situación financiera ---
  const activoCirculante = nuevoGrupo("Activo circulante");
  const activoNoCirculante = nuevoGrupo("Activo no circulante");
  const pasivoCortoPlazo = nuevoGrupo("Pasivo a corto plazo");
  const pasivoLargoPlazo = nuevoGrupo("Pasivo a largo plazo");
  const capitalContable = nuevoGrupo("Capital contable");

  for (const r of balanza.renglones) {
    const g = grupoMayor(r.cuenta.codigoAgrupador, r.cuenta.codigo);
    const saldo = r.saldoFinal; // convención deudora: debe − haber
    const nombre = r.cuenta.nombre;
    const cod = r.cuenta.codigo;

    if (g >= 100 && g < 200) {
      // Activo (deudora positiva). La depreciación acumulada (17x) es contra-activo.
      if (g < 150) agregar(activoCirculante, cod, nombre, saldo);
      else agregar(activoNoCirculante, cod, nombre, saldo);
    } else if (g >= 200 && g < 300) {
      // Pasivo (acreedora): se presenta positivo
      if (g < 250) agregar(pasivoCortoPlazo, cod, nombre, -saldo);
      else agregar(pasivoLargoPlazo, cod, nombre, -saldo);
    } else if (g >= 300 && g < 400) {
      agregar(capitalContable, cod, nombre, -saldo);
    } else if (g >= 400 && g < 500) {
      // Ingresos (acreedora positiva); 402 devoluciones/descuentos es deudora y resta
      agregar(ingresos, cod, nombre, -saldo);
    } else if (g >= 500 && g < 600) {
      agregar(costos, cod, nombre, saldo);
    } else if (g >= 600 && g < 700) {
      agregar(gastos, cod, nombre, saldo);
    } else if (g >= 700 && g < 800) {
      agregar(otros, cod, nombre, -saldo);
    }
  }

  const utilidadBruta = round2(ingresos.total - costos.total);
  const utilidadOperacion = round2(utilidadBruta - gastos.total);
  const utilidadNeta = round2(utilidadOperacion + otros.total);

  const totalActivo = round2(activoCirculante.total + activoNoCirculante.total);
  const totalPasivo = round2(pasivoCortoPlazo.total + pasivoLargoPlazo.total);
  const resultadoEjercicio = utilidadNeta;
  const totalCapital = round2(capitalContable.total + resultadoEjercicio);
  const totalPasivoMasCapital = round2(totalPasivo + totalCapital);

  return {
    resultados: {
      periodo: { anio, mes },
      ingresos,
      costos,
      utilidadBruta,
      gastos,
      utilidadOperacion,
      otros,
      utilidadNeta,
    },
    situacion: {
      corte: { anio, mes },
      activoCirculante,
      activoNoCirculante,
      totalActivo,
      pasivoCortoPlazo,
      pasivoLargoPlazo,
      totalPasivo,
      capitalContable,
      resultadoEjercicio,
      totalCapital,
      totalPasivoMasCapital,
      diferencia: round2(totalActivo - totalPasivoMasCapital),
    },
    cuadrada: balanza.cuadrada && Math.abs(round2(totalActivo - totalPasivoMasCapital)) < 0.5,
  };
}
