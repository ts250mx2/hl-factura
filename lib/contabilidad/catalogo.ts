import type { CuentaContable } from "../types";

// Catálogo de cuentas inicial con código agrupador del SAT (Anexo 24).
// Es un punto de partida editable: el contador puede ajustar cuentas y
// agrupadores desde la interfaz antes de exportar al SAT.

/** Cuentas que usa el motor de pólizas automáticas. */
export const CTA = {
  CAJA: "101.01",
  BANCOS: "102.01",
  CLIENTES: "105.01",
  RET_FAVOR: "113.01", // ISR/IVA que nos retuvieron (a favor)
  IVA_ACRED: "118.01", // IVA acreditable pagado
  IVA_ACRED_PEND: "119.01", // IVA acreditable pendiente de pago (PPD)
  DEP_ACUM: "171.01",
  PROVEEDORES: "201.01",
  RET_POR_PAGAR: "216.01", // impuestos que retuvimos a terceros
  IVA_TRAS: "208.01", // IVA trasladado cobrado
  IVA_TRAS_PEND: "209.01", // IVA trasladado no cobrado (PPD)
  CAPITAL: "301.01",
  VENTAS: "401.01",
  DESCUENTOS: "402.01",
  GASTOS: "601.01",
  NO_DEDUCIBLE: "601.02",
  GASTO_DEP: "601.03",
} as const;

type Semilla = Omit<CuentaContable, "empresaId">;

export const CATALOGO_SEMILLA: Semilla[] = [
  { codigo: "101.01", nombre: "Caja", codigoAgrupador: "101.01", naturaleza: "D", nivel: 2 },
  { codigo: "102.01", nombre: "Bancos nacionales", codigoAgrupador: "102.01", naturaleza: "D", nivel: 2 },
  { codigo: "105.01", nombre: "Clientes nacionales", codigoAgrupador: "105.01", naturaleza: "D", nivel: 2 },
  { codigo: "113.01", nombre: "Impuestos retenidos a favor (ISR/IVA)", codigoAgrupador: "113.01", naturaleza: "D", nivel: 2 },
  { codigo: "118.01", nombre: "IVA acreditable pagado", codigoAgrupador: "118.01", naturaleza: "D", nivel: 2 },
  { codigo: "119.01", nombre: "IVA acreditable pendiente de pago", codigoAgrupador: "119.01", naturaleza: "D", nivel: 2 },
  { codigo: "152.01", nombre: "Edificios", codigoAgrupador: "152.01", naturaleza: "D", nivel: 2 },
  { codigo: "153.01", nombre: "Maquinaria y equipo", codigoAgrupador: "153.01", naturaleza: "D", nivel: 2 },
  { codigo: "154.01", nombre: "Equipo de transporte", codigoAgrupador: "154.01", naturaleza: "D", nivel: 2 },
  { codigo: "155.01", nombre: "Mobiliario y equipo de oficina", codigoAgrupador: "155.01", naturaleza: "D", nivel: 2 },
  { codigo: "156.01", nombre: "Equipo de cómputo", codigoAgrupador: "156.01", naturaleza: "D", nivel: 2 },
  { codigo: "171.01", nombre: "Depreciación acumulada de activos", codigoAgrupador: "171.01", naturaleza: "A", nivel: 2 },
  { codigo: "201.01", nombre: "Proveedores nacionales", codigoAgrupador: "201.01", naturaleza: "A", nivel: 2 },
  { codigo: "208.01", nombre: "IVA trasladado cobrado", codigoAgrupador: "208.01", naturaleza: "A", nivel: 2 },
  { codigo: "209.01", nombre: "IVA trasladado no cobrado", codigoAgrupador: "209.01", naturaleza: "A", nivel: 2 },
  { codigo: "216.01", nombre: "Impuestos retenidos por pagar", codigoAgrupador: "216.01", naturaleza: "A", nivel: 2 },
  { codigo: "301.01", nombre: "Capital social", codigoAgrupador: "301.01", naturaleza: "A", nivel: 2 },
  { codigo: "401.01", nombre: "Ingresos por ventas y servicios", codigoAgrupador: "401.01", naturaleza: "A", nivel: 2 },
  { codigo: "402.01", nombre: "Devoluciones y descuentos sobre ingresos", codigoAgrupador: "402.01", naturaleza: "D", nivel: 2 },
  { codigo: "501.01", nombre: "Costo de venta", codigoAgrupador: "501.01", naturaleza: "D", nivel: 2 },
  { codigo: "601.01", nombre: "Gastos generales", codigoAgrupador: "601.84", naturaleza: "D", nivel: 2 },
  { codigo: "601.02", nombre: "Gastos no deducibles", codigoAgrupador: "601.83", naturaleza: "D", nivel: 2 },
  { codigo: "601.03", nombre: "Depreciación del ejercicio", codigoAgrupador: "601.84", naturaleza: "D", nivel: 2 },
];

/** Tasas de depreciación anual típicas (Art. 34-35 LISR) para el alta de activos. */
export const TASAS_DEPRECIACION = [
  { etiqueta: "Equipo de cómputo (30%)", tasa: 30 },
  { etiqueta: "Equipo de transporte (25%)", tasa: 25 },
  { etiqueta: "Mobiliario y equipo de oficina (10%)", tasa: 10 },
  { etiqueta: "Maquinaria y equipo (10%)", tasa: 10 },
  { etiqueta: "Edificios (5%)", tasa: 5 },
];
