// Catálogos del SAT (CFDI 4.0). Subconjuntos de los catálogos oficiales del Anexo 20.

export interface ItemCatalogo {
  clave: string;
  descripcion: string;
}

export interface RegimenFiscal extends ItemCatalogo {
  fisica: boolean;
  moral: boolean;
}

export const REGIMENES_FISCALES: RegimenFiscal[] = [
  { clave: "601", descripcion: "General de Ley Personas Morales", fisica: false, moral: true },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos", fisica: false, moral: true },
  { clave: "605", descripcion: "Sueldos y Salarios e Ingresos Asimilados a Salarios", fisica: true, moral: false },
  { clave: "606", descripcion: "Arrendamiento", fisica: true, moral: false },
  { clave: "607", descripcion: "Régimen de Enajenación o Adquisición de Bienes", fisica: true, moral: false },
  { clave: "608", descripcion: "Demás ingresos", fisica: true, moral: false },
  { clave: "610", descripcion: "Residentes en el Extranjero sin Establecimiento Permanente en México", fisica: true, moral: true },
  { clave: "611", descripcion: "Ingresos por Dividendos (socios y accionistas)", fisica: true, moral: false },
  { clave: "612", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales", fisica: true, moral: false },
  { clave: "614", descripcion: "Ingresos por intereses", fisica: true, moral: false },
  { clave: "615", descripcion: "Régimen de los ingresos por obtención de premios", fisica: true, moral: false },
  { clave: "616", descripcion: "Sin obligaciones fiscales", fisica: true, moral: false },
  { clave: "620", descripcion: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", fisica: false, moral: true },
  { clave: "621", descripcion: "Incorporación Fiscal", fisica: true, moral: false },
  { clave: "622", descripcion: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", fisica: true, moral: true },
  { clave: "623", descripcion: "Opcional para Grupos de Sociedades", fisica: false, moral: true },
  { clave: "624", descripcion: "Coordinados", fisica: false, moral: true },
  { clave: "625", descripcion: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas", fisica: true, moral: false },
  { clave: "626", descripcion: "Régimen Simplificado de Confianza (RESICO)", fisica: true, moral: true },
];

export interface UsoCfdi extends ItemCatalogo {
  fisica: boolean;
  moral: boolean;
  regimenes: string[]; // regímenes fiscales del receptor con los que es compatible
}

const REG_EMPRESARIALES = ["601", "603", "606", "612", "620", "621", "622", "623", "624", "625", "626"];
const REG_DEDUCCIONES = ["605", "606", "607", "608", "611", "612", "614", "615", "625"];
const REG_TODOS = REGIMENES_FISCALES.map((r) => r.clave);

export const USOS_CFDI: UsoCfdi[] = [
  { clave: "G01", descripcion: "Adquisición de mercancías", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "G02", descripcion: "Devoluciones, descuentos o bonificaciones", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "G03", descripcion: "Gastos en general", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I01", descripcion: "Construcciones", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I02", descripcion: "Mobiliario y equipo de oficina por inversiones", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I03", descripcion: "Equipo de transporte", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I04", descripcion: "Equipo de cómputo y accesorios", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I05", descripcion: "Dados, troqueles, moldes, matrices y herramental", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I06", descripcion: "Comunicaciones telefónicas", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I07", descripcion: "Comunicaciones satelitales", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "I08", descripcion: "Otra maquinaria y equipo", fisica: true, moral: true, regimenes: REG_EMPRESARIALES },
  { clave: "D01", descripcion: "Honorarios médicos, dentales y gastos hospitalarios", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D02", descripcion: "Gastos médicos por incapacidad o discapacidad", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D03", descripcion: "Gastos funerales", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D04", descripcion: "Donativos", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D05", descripcion: "Intereses reales pagados por créditos hipotecarios (casa habitación)", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D06", descripcion: "Aportaciones voluntarias al SAR", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D07", descripcion: "Primas por seguros de gastos médicos", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D08", descripcion: "Gastos de transportación escolar obligatoria", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D09", descripcion: "Depósitos en cuentas de ahorro / planes de pensiones", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "D10", descripcion: "Pagos por servicios educativos (colegiaturas)", fisica: true, moral: false, regimenes: REG_DEDUCCIONES },
  { clave: "S01", descripcion: "Sin efectos fiscales", fisica: true, moral: true, regimenes: REG_TODOS },
  { clave: "CP01", descripcion: "Pagos", fisica: true, moral: true, regimenes: REG_TODOS },
  { clave: "CN01", descripcion: "Nómina", fisica: true, moral: false, regimenes: ["605"] },
];

export const FORMAS_PAGO: ItemCatalogo[] = [
  { clave: "01", descripcion: "Efectivo" },
  { clave: "02", descripcion: "Cheque nominativo" },
  { clave: "03", descripcion: "Transferencia electrónica de fondos" },
  { clave: "04", descripcion: "Tarjeta de crédito" },
  { clave: "05", descripcion: "Monedero electrónico" },
  { clave: "06", descripcion: "Dinero electrónico" },
  { clave: "08", descripcion: "Vales de despensa" },
  { clave: "12", descripcion: "Dación en pago" },
  { clave: "13", descripcion: "Pago por subrogación" },
  { clave: "14", descripcion: "Pago por consignación" },
  { clave: "15", descripcion: "Condonación" },
  { clave: "17", descripcion: "Compensación" },
  { clave: "23", descripcion: "Novación" },
  { clave: "24", descripcion: "Confusión" },
  { clave: "25", descripcion: "Remisión de deuda" },
  { clave: "26", descripcion: "Prescripción o caducidad" },
  { clave: "27", descripcion: "A satisfacción del acreedor" },
  { clave: "28", descripcion: "Tarjeta de débito" },
  { clave: "29", descripcion: "Tarjeta de servicios" },
  { clave: "30", descripcion: "Aplicación de anticipos" },
  { clave: "31", descripcion: "Intermediario pagos" },
  { clave: "99", descripcion: "Por definir" },
];

export const METODOS_PAGO: ItemCatalogo[] = [
  { clave: "PUE", descripcion: "Pago en una sola exhibición" },
  { clave: "PPD", descripcion: "Pago en parcialidades o diferido" },
];

export const MONEDAS: (ItemCatalogo & { decimales: number })[] = [
  { clave: "MXN", descripcion: "Peso Mexicano", decimales: 2 },
  { clave: "USD", descripcion: "Dólar americano", decimales: 2 },
  { clave: "EUR", descripcion: "Euro", decimales: 2 },
];

export const OBJETOS_IMP: ItemCatalogo[] = [
  { clave: "01", descripcion: "No objeto de impuesto" },
  { clave: "02", descripcion: "Sí objeto de impuesto" },
  { clave: "03", descripcion: "Sí objeto del impuesto y no obligado al desglose" },
  { clave: "04", descripcion: "Sí objeto del impuesto y no causa impuesto" },
  { clave: "05", descripcion: "Sí objeto del impuesto, IVA crédito PODEBI" },
];

export const EXPORTACIONES: ItemCatalogo[] = [
  { clave: "01", descripcion: "No aplica" },
  { clave: "02", descripcion: "Definitiva con clave A1" },
  { clave: "03", descripcion: "Temporal" },
  { clave: "04", descripcion: "Definitiva con clave distinta a A1" },
];

export const TIPOS_COMPROBANTE: ItemCatalogo[] = [
  { clave: "I", descripcion: "Ingreso" },
  { clave: "E", descripcion: "Egreso (nota de crédito)" },
  { clave: "T", descripcion: "Traslado" },
  { clave: "N", descripcion: "Nómina" },
  { clave: "P", descripcion: "Pago" },
];

export const CLAVES_UNIDAD: ItemCatalogo[] = [
  { clave: "H87", descripcion: "Pieza" },
  { clave: "E48", descripcion: "Unidad de servicio" },
  { clave: "ACT", descripcion: "Actividad" },
  { clave: "E51", descripcion: "Trabajo" },
  { clave: "C62", descripcion: "Uno (unidad genérica)" },
  { clave: "XUN", descripcion: "Unidad" },
  { clave: "HUR", descripcion: "Hora" },
  { clave: "DAY", descripcion: "Día" },
  { clave: "WEE", descripcion: "Semana" },
  { clave: "MON", descripcion: "Mes" },
  { clave: "ANN", descripcion: "Año" },
  { clave: "KGM", descripcion: "Kilogramo" },
  { clave: "GRM", descripcion: "Gramo" },
  { clave: "TNE", descripcion: "Tonelada" },
  { clave: "LBR", descripcion: "Libra" },
  { clave: "LTR", descripcion: "Litro" },
  { clave: "MTR", descripcion: "Metro" },
  { clave: "CMT", descripcion: "Centímetro" },
  { clave: "KMT", descripcion: "Kilómetro" },
  { clave: "MTK", descripcion: "Metro cuadrado" },
  { clave: "MTQ", descripcion: "Metro cúbico" },
  { clave: "KWH", descripcion: "Kilowatt hora" },
  { clave: "MIL", descripcion: "Millar" },
  { clave: "DZN", descripcion: "Docena" },
  { clave: "PR", descripcion: "Par" },
  { clave: "SET", descripcion: "Conjunto" },
  { clave: "XBX", descripcion: "Caja" },
  { clave: "XPK", descripcion: "Paquete" },
];

// Subconjunto de claves de producto/servicio de uso común (el catálogo completo
// tiene +52,000 claves; aquí se puede capturar cualquier clave de 8 dígitos).
export const CLAVES_PROD_SERV_COMUNES: ItemCatalogo[] = [
  { clave: "01010101", descripcion: "No existe en el catálogo" },
  { clave: "84111506", descripcion: "Servicios de facturación" },
  { clave: "80101500", descripcion: "Servicios de consultoría de negocios" },
  { clave: "80141600", descripcion: "Actividades de ventas y promoción de negocios" },
  { clave: "81111500", descripcion: "Ingeniería de software o hardware" },
  { clave: "81112100", descripcion: "Servicios de internet" },
  { clave: "81161700", descripcion: "Servicios de correo electrónico y mensajería" },
  { clave: "43211500", descripcion: "Computadoras" },
  { clave: "43211503", descripcion: "Computadoras portátiles (notebook)" },
  { clave: "43231500", descripcion: "Software funcional específico de la empresa" },
  { clave: "44121600", descripcion: "Suministros de escritorio" },
  { clave: "44122000", descripcion: "Carpetas de archivo y accesorios" },
  { clave: "50192100", descripcion: "Comidas preparadas" },
  { clave: "90101500", descripcion: "Establecimientos para comer y beber (restaurantes)" },
  { clave: "78101800", descripcion: "Transporte de carga por carretera" },
  { clave: "78111800", descripcion: "Transporte de pasajeros por carretera" },
  { clave: "72102900", descripcion: "Servicios de mantenimiento y reparación de instalaciones" },
  { clave: "80111600", descripcion: "Servicios de personal temporal" },
  { clave: "85121500", descripcion: "Servicios de práctica y especialistas médicos" },
  { clave: "86132000", descripcion: "Servicios de educación y capacitación" },
  { clave: "15101514", descripcion: "Gasolina" },
  { clave: "25101500", descripcion: "Turismos o automóviles" },
];

export const MOTIVOS_CANCELACION: ItemCatalogo[] = [
  { clave: "01", descripcion: "Comprobante emitido con errores con relación (requiere folio de sustitución)" },
  { clave: "02", descripcion: "Comprobante emitido con errores sin relación" },
  { clave: "03", descripcion: "No se llevó a cabo la operación" },
  { clave: "04", descripcion: "Operación nominativa relacionada en una factura global" },
];

export const TIPOS_RELACION: ItemCatalogo[] = [
  { clave: "01", descripcion: "Nota de crédito de los documentos relacionados" },
  { clave: "02", descripcion: "Nota de débito de los documentos relacionados" },
  { clave: "03", descripcion: "Devolución de mercancía sobre facturas o traslados previos" },
  { clave: "04", descripcion: "Sustitución de los CFDI previos" },
  { clave: "05", descripcion: "Traslados de mercancías facturados previamente" },
  { clave: "06", descripcion: "Factura generada por los traslados previos" },
  { clave: "07", descripcion: "CFDI por aplicación de anticipo" },
];

export const PERIODICIDADES: ItemCatalogo[] = [
  { clave: "01", descripcion: "Diario" },
  { clave: "02", descripcion: "Semanal" },
  { clave: "03", descripcion: "Quincenal" },
  { clave: "04", descripcion: "Mensual" },
  { clave: "05", descripcion: "Bimestral" },
];

export const MESES_GLOBAL: ItemCatalogo[] = [
  { clave: "01", descripcion: "Enero" },
  { clave: "02", descripcion: "Febrero" },
  { clave: "03", descripcion: "Marzo" },
  { clave: "04", descripcion: "Abril" },
  { clave: "05", descripcion: "Mayo" },
  { clave: "06", descripcion: "Junio" },
  { clave: "07", descripcion: "Julio" },
  { clave: "08", descripcion: "Agosto" },
  { clave: "09", descripcion: "Septiembre" },
  { clave: "10", descripcion: "Octubre" },
  { clave: "11", descripcion: "Noviembre" },
  { clave: "12", descripcion: "Diciembre" },
  { clave: "13", descripcion: "Enero-Febrero" },
  { clave: "14", descripcion: "Marzo-Abril" },
  { clave: "15", descripcion: "Mayo-Junio" },
  { clave: "16", descripcion: "Julio-Agosto" },
  { clave: "17", descripcion: "Septiembre-Octubre" },
  { clave: "18", descripcion: "Noviembre-Diciembre" },
];

export const TASAS_IVA = [
  { valor: 0.16, etiqueta: "IVA 16%" },
  { valor: 0.08, etiqueta: "IVA 8% (región fronteriza)" },
  { valor: 0, etiqueta: "IVA 0%" },
] as const;

export function descripcionCatalogo(catalogo: ItemCatalogo[], clave: string): string {
  return catalogo.find((i) => i.clave === clave)?.descripcion ?? clave;
}

export function usosPermitidos(regimenReceptor: string, esMoral: boolean): UsoCfdi[] {
  return USOS_CFDI.filter(
    (u) =>
      u.regimenes.includes(regimenReceptor) && (esMoral ? u.moral : u.fisica) &&
      u.clave !== "CP01" && u.clave !== "CN01",
  );
}
