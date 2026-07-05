// Catálogos del complemento de Nómina 1.2 y parámetros laborales.

export interface ItemCat {
  clave: string;
  descripcion: string;
}

export const PERIODICIDADES_PAGO: (ItemCat & { dias: number })[] = [
  { clave: "02", descripcion: "Semanal", dias: 7 },
  { clave: "03", descripcion: "Catorcenal", dias: 14 },
  { clave: "04", descripcion: "Quincenal", dias: 15 },
  { clave: "05", descripcion: "Mensual", dias: 30 },
];

export const TIPOS_CONTRATO: ItemCat[] = [
  { clave: "01", descripcion: "Contrato por tiempo indeterminado" },
  { clave: "02", descripcion: "Contrato por obra determinada" },
  { clave: "03", descripcion: "Contrato por tiempo determinado" },
  { clave: "09", descripcion: "Modalidades de contratación donde no existe relación de trabajo" },
];

export const TIPOS_REGIMEN: ItemCat[] = [
  { clave: "02", descripcion: "Sueldos (incluye ingresos señalados en la fracción I del Art. 94 LISR)" },
  { clave: "09", descripcion: "Asimilados a salarios — honorarios" },
  { clave: "11", descripcion: "Asimilados a salarios — otros" },
];

export const RIESGOS_PUESTO: ItemCat[] = [
  { clave: "1", descripcion: "Clase I (riesgo mínimo)" },
  { clave: "2", descripcion: "Clase II (riesgo bajo)" },
  { clave: "3", descripcion: "Clase III (riesgo medio)" },
  { clave: "4", descripcion: "Clase IV (riesgo alto)" },
  { clave: "5", descripcion: "Clase V (riesgo máximo)" },
];

export const ENTIDADES_FEDERATIVAS: ItemCat[] = [
  { clave: "AGU", descripcion: "Aguascalientes" },
  { clave: "BCN", descripcion: "Baja California" },
  { clave: "BCS", descripcion: "Baja California Sur" },
  { clave: "CAM", descripcion: "Campeche" },
  { clave: "COA", descripcion: "Coahuila" },
  { clave: "COL", descripcion: "Colima" },
  { clave: "CHP", descripcion: "Chiapas" },
  { clave: "CHH", descripcion: "Chihuahua" },
  { clave: "CMX", descripcion: "Ciudad de México" },
  { clave: "DUR", descripcion: "Durango" },
  { clave: "GUA", descripcion: "Guanajuato" },
  { clave: "GRO", descripcion: "Guerrero" },
  { clave: "HID", descripcion: "Hidalgo" },
  { clave: "JAL", descripcion: "Jalisco" },
  { clave: "MEX", descripcion: "Estado de México" },
  { clave: "MIC", descripcion: "Michoacán" },
  { clave: "MOR", descripcion: "Morelos" },
  { clave: "NAY", descripcion: "Nayarit" },
  { clave: "NLE", descripcion: "Nuevo León" },
  { clave: "OAX", descripcion: "Oaxaca" },
  { clave: "PUE", descripcion: "Puebla" },
  { clave: "QUE", descripcion: "Querétaro" },
  { clave: "ROO", descripcion: "Quintana Roo" },
  { clave: "SLP", descripcion: "San Luis Potosí" },
  { clave: "SIN", descripcion: "Sinaloa" },
  { clave: "SON", descripcion: "Sonora" },
  { clave: "TAB", descripcion: "Tabasco" },
  { clave: "TAM", descripcion: "Tamaulipas" },
  { clave: "TLA", descripcion: "Tlaxcala" },
  { clave: "VER", descripcion: "Veracruz" },
  { clave: "YUC", descripcion: "Yucatán" },
  { clave: "ZAC", descripcion: "Zacatecas" },
];

export const TIPOS_INCAPACIDAD: ItemCat[] = [
  { clave: "01", descripcion: "Riesgo de trabajo" },
  { clave: "02", descripcion: "Enfermedad en general" },
  { clave: "03", descripcion: "Maternidad" },
  { clave: "04", descripcion: "Licencia por cuidados médicos de hijos con cáncer" },
];

// Claves de percepción/deducción/otros pagos que usa el motor
export const PERCEPCION = {
  SUELDO: { tipo: "001", clave: "P001", concepto: "Sueldos, salarios, rayas y jornales" },
  AGUINALDO: { tipo: "002", clave: "P002", concepto: "Aguinaldo" },
  HORAS_EXTRA: { tipo: "019", clave: "P019", concepto: "Horas extra" },
  PRIMA_VACACIONAL: { tipo: "021", clave: "P021", concepto: "Prima vacacional" },
  BONO: { tipo: "038", clave: "P038", concepto: "Otros ingresos por salarios (bono/comisión)" },
} as const;

export const DEDUCCION = {
  IMSS: { tipo: "001", clave: "D001", concepto: "Seguridad social (IMSS)" },
  ISR: { tipo: "002", clave: "D002", concepto: "ISR retenido" },
  OTRAS: { tipo: "004", clave: "D004", concepto: "Otras deducciones" },
} as const;

export const OTRO_PAGO = {
  SUBSIDIO: { tipo: "002", clave: "OP002", concepto: "Subsidio para el empleo" },
} as const;

/**
 * Parámetros por defecto (valores 2025 — edítalos en Configuración de nómina
 * cuando el SAT/CONASAMI publiquen los del año en curso).
 */
export const PARAMETROS_DEFAULT = {
  uma: 113.14, // UMA diaria 2025
  salarioMinimo: 278.8, // general 2025
  subsidioMensual: 474.94, // 13.8% de la UMA mensual (decreto vigente 2025)
  subsidioTopeIngresos: 10171.0, // ingreso mensual máximo para aplicar subsidio
  primaRiesgo: 0.54355, // % clase I mínima (ajústala a la prima de tu empresa)
};

/** Días de vacaciones por años de servicio (LFT reforma "vacaciones dignas" 2023). */
export function diasVacaciones(aniosServicio: number): number {
  if (aniosServicio <= 0) return 12;
  if (aniosServicio <= 5) return 12 + 2 * (aniosServicio - 1);
  return 20 + 2 * Math.floor((aniosServicio - 5 + 4) / 5); // +2 cada 5 años después del 5º
}

/** Factor de integración del SDI (aguinaldo 15 días + prima vacacional 25%). */
export function factorIntegracion(aniosServicio: number): number {
  const vac = diasVacaciones(Math.max(1, aniosServicio));
  return (365 + 15 + 0.25 * vac) / 365;
}
