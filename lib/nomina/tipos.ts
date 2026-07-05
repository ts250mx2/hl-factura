// Tipos del módulo de nómina.

export interface Empleado {
  id: string;
  empresaId: string;
  numEmpleado: string;
  nombre: string; // como en la CSF
  rfc: string;
  curp: string;
  nss: string;
  codigoPostal: string; // domicilio fiscal (CSF)
  email?: string;
  fechaInicioLaboral: string; // YYYY-MM-DD
  tipoContrato: string; // c_TipoContrato
  tipoRegimen: string; // c_TipoRegimen (02 sueldos)
  periodicidadPago: string; // c_PeriodicidadPago
  riesgoPuesto: string; // 1-5
  departamento?: string;
  puesto?: string;
  banco?: string; // clave 3 dígitos (opcional)
  cuentaBancaria?: string;
  salarioDiario: number;
  activo: boolean;
  creadoEl: string;
}

export interface IncidenciasEmpleado {
  faltas: number; // días
  horasExtraDobles: number; // horas
  diasIncapacidad: number;
  tipoIncapacidad: string; // 01-04
  diasVacaciones: number; // días de vacaciones gozadas en el periodo (informativo)
  pagarPrimaVacacional: boolean;
  diasAguinaldo: number; // 0 = no pagar aguinaldo en este periodo
  bono: number; // importe gravado adicional
  otrasDeducciones: number;
  notaOtrasDeducciones?: string;
}

export interface LineaNomina {
  tipo: string; // clave SAT (percepción/deducción/otro pago)
  clave: string;
  concepto: string;
  gravado: number;
  exento: number; // para deducciones/otros: usar solo "gravado" como importe
}

export interface CalculoRecibo {
  diasPagados: number;
  salarioDiario: number;
  sdi: number;
  sbc: number;
  percepciones: LineaNomina[];
  deducciones: LineaNomina[];
  otrosPagos: LineaNomina[];
  totalPercepciones: number;
  totalGravado: number;
  totalExento: number;
  totalDeducciones: number;
  totalOtrosPagos: number;
  neto: number;
  // desgloses informativos
  isr: { base: number; tarifa: number; cuota: number; causado: number; subsidio: number; retenido: number };
  imssObrero: number;
  costoPatronal: { imss: number; infonavit: number; total: number };
  horasExtra?: { dias: number; horas: number; importe: number };
  incapacidad?: { dias: number; tipo: string };
}

export interface ReciboNomina {
  id: string;
  empresaId: string;
  empleadoId: string;
  empleadoNombre: string;
  empleadoRfc: string;
  periodoInicio: string; // YYYY-MM-DD
  periodoFin: string;
  fechaPago: string;
  calculo: CalculoRecibo;
  incidencias: IncidenciasEmpleado;
  estado: "timbrada" | "error" | "cancelada";
  demo: boolean;
  uuid?: string;
  fechaTimbrado?: string;
  selloCFD?: string;
  noCertificado?: string;
  xmlPath?: string;
  errorMsg?: string;
  enviadoEl?: string; // correo
  creadoEl: string;
}

export interface ConfigNomina {
  registroPatronal: string;
  claveEntFed: string;
  primaRiesgo: number; // % (ej. 0.54355)
  uma: number;
  salarioMinimo: number;
  subsidioMensual: number;
  subsidioTopeIngresos: number;
}
