import { XMLParser } from "fast-xml-parser";
import type { ImpuestosProducto, ImpuestoDR } from "../types";

// Parser de CFDI compartido por la ingesta y la derivación a operación
// (clientes/productos/facturas/pagos). Un solo módulo sin dependencias de
// negocio para evitar imports circulares.

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
});

export type Nodo = Record<string, unknown>;

export function nodo(n: Nodo | undefined, nombre: string): Nodo | undefined {
  const v = n?.[nombre];
  if (v === undefined) return undefined;
  return (Array.isArray(v) ? v[0] : v) as Nodo;
}

export function lista(n: Nodo | undefined, nombre: string): Nodo[] {
  const v = n?.[nombre];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]) as Nodo[];
}

export function attr(n: Nodo | undefined, nombre: string): string | undefined {
  const v = n?.[`@${nombre}`];
  return v === undefined ? undefined : String(v);
}

const num = (v: string | undefined): number => Number(v ?? 0) || 0;

export interface DatosCfdi {
  uuid: string;
  version: string;
  tipoComprobante: string;
  fecha: string;
  total: number;
  metodoPago?: string;
  formaPago?: string;
  emisorRfc: string;
  emisorNombre?: string;
  receptorRfc: string;
  receptorNombre?: string;
}

/** Encabezado mínimo del CFDI (lo que va a la bóveda). */
export function parseCfdiBasico(xml: string): DatosCfdi {
  const doc = parser.parse(xml) as Nodo;
  const comp = nodo(doc, "Comprobante");
  if (!comp) throw new Error("El XML no es un CFDI (falta el nodo Comprobante).");
  const complemento = nodo(comp, "Complemento");
  const tfd = complemento ? nodo(complemento, "TimbreFiscalDigital") : undefined;
  const uuid = attr(tfd, "UUID")?.toUpperCase();
  if (!uuid) throw new Error("El CFDI no está timbrado (sin UUID).");
  const emisor = nodo(comp, "Emisor");
  const receptor = nodo(comp, "Receptor");
  return {
    uuid,
    version: attr(comp, "Version") ?? attr(comp, "version") ?? "",
    tipoComprobante: attr(comp, "TipoDeComprobante") ?? attr(comp, "tipoDeComprobante") ?? "I",
    fecha: attr(comp, "Fecha") ?? attr(comp, "fecha") ?? "",
    total: num(attr(comp, "Total") ?? attr(comp, "total")),
    metodoPago: attr(comp, "MetodoPago") ?? attr(comp, "metodoDePago"),
    formaPago: attr(comp, "FormaPago") ?? attr(comp, "formaDePago"),
    emisorRfc: (attr(emisor, "Rfc") ?? attr(emisor, "rfc") ?? "").toUpperCase(),
    emisorNombre: attr(emisor, "Nombre") ?? attr(emisor, "nombre"),
    receptorRfc: (attr(receptor, "Rfc") ?? attr(receptor, "rfc") ?? "").toUpperCase(),
    receptorNombre: attr(receptor, "Nombre") ?? attr(receptor, "nombre"),
  };
}

export interface ConceptoParsed {
  claveProdServ: string;
  claveUnidad: string;
  unidad?: string;
  noIdentificacion?: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  descuento: number;
  importe: number;
  objetoImp: string;
  impuestos: ImpuestosProducto;
  base: number;
  ivaImporte: number;
  retIvaImporte: number;
  retIsrImporte: number;
  iepsImporte: number;
}

export interface PagoParsed {
  fechaPago: string;
  formaPago: string;
  moneda: string;
  monto: number;
  doctos: {
    facturaId: string;
    uuid: string;
    serie?: string;
    folio?: string;
    parcialidad: number;
    saldoAnterior: number;
    pagado: number;
    saldoInsoluto: number;
    objetoImpDR: "01" | "02";
    impuestos: ImpuestoDR[];
  }[];
}

/** Datos del trabajador (receptor) de un CFDI de nómina (complemento nomina12). */
export interface NominaParsed {
  curp: string;
  nss: string;
  numEmpleado: string;
  fechaInicioLaboral: string;
  tipoContrato: string;
  tipoRegimen: string;
  periodicidadPago: string;
  riesgoPuesto: string;
  departamento?: string;
  puesto?: string;
  banco?: string;
  cuentaBancaria?: string;
  sbc: number;
  sdi: number;
  numDiasPagados: number;
  fechaPago: string;
  periodoInicio: string;
  periodoFin: string;
  totalPercepciones: number;
  totalDeducciones: number;
  salarioDiario: number; // estimado: sueldo (percepción 001) / días pagados, o el SDI
}

export interface CfdiCompleto extends DatosCfdi {
  serie?: string;
  folio?: string;
  moneda?: string;
  tipoCambio?: number;
  usoCfdi?: string;
  subTotal: number;
  descuento: number;
  totalTraslados: number;
  totalRetenciones: number;
  fechaTimbrado?: string;
  emisorRegimen?: string;
  receptorRegimen?: string;
  receptorCp?: string;
  conceptos: ConceptoParsed[];
  pagos: PagoParsed[];
  nomina?: NominaParsed;
}

/** Impuestos de un concepto → ImpuestosProducto + importes calculados. */
function impuestosDeConcepto(con: Nodo, importeBase: number) {
  const impNode = nodo(con, "Impuestos");
  const traslados = impNode ? lista(nodo(impNode, "Traslados"), "Traslado") : [];
  const retenciones = impNode ? lista(nodo(impNode, "Retenciones"), "Retencion") : [];
  let ivaTasa: number | null = null;
  let ivaExento = false;
  let iepsTasa: number | null = null;
  let retIvaTasa: number | null = null;
  let retIsrTasa: number | null = null;
  let ivaImporte = 0;
  let iepsImporte = 0;
  let retIvaImporte = 0;
  let retIsrImporte = 0;
  let base = 0;
  for (const t of traslados) {
    const imp = attr(t, "Impuesto");
    const factor = attr(t, "TipoFactor");
    const tasa = num(attr(t, "TasaOCuota"));
    const importe = num(attr(t, "Importe"));
    const b = num(attr(t, "Base"));
    if (imp === "002") {
      base = b || base;
      if (factor === "Exento") ivaExento = true;
      else {
        ivaTasa = tasa;
        ivaImporte += importe;
      }
    } else if (imp === "003") {
      iepsTasa = tasa;
      iepsImporte += importe;
    }
  }
  for (const r of retenciones) {
    const imp = attr(r, "Impuesto");
    const tasa = num(attr(r, "TasaOCuota"));
    const importe = num(attr(r, "Importe"));
    if (imp === "002") {
      retIvaTasa = tasa;
      retIvaImporte += importe;
    } else if (imp === "001") {
      retIsrTasa = tasa;
      retIsrImporte += importe;
    }
  }
  const impuestos: ImpuestosProducto = { ivaTasa, ivaExento, retIvaTasa, retIsrTasa, iepsTasa };
  return { impuestos, ivaImporte, iepsImporte, retIvaImporte, retIsrImporte, base: base || importeBase };
}

function parseConceptos(comp: Nodo): ConceptoParsed[] {
  const conNode = nodo(comp, "Conceptos");
  const conceptos = conNode ? lista(conNode, "Concepto") : [];
  return conceptos.map((c) => {
    const importe = num(attr(c, "Importe"));
    const descuento = num(attr(c, "Descuento"));
    const objetoImp = attr(c, "ObjetoImp") ?? "02";
    const imp = impuestosDeConcepto(c, importe - descuento);
    return {
      claveProdServ: attr(c, "ClaveProdServ") ?? "",
      claveUnidad: attr(c, "ClaveUnidad") ?? "",
      unidad: attr(c, "Unidad"),
      noIdentificacion: attr(c, "NoIdentificacion"),
      descripcion: attr(c, "Descripcion") ?? "",
      cantidad: num(attr(c, "Cantidad")),
      valorUnitario: num(attr(c, "ValorUnitario")),
      descuento,
      importe,
      objetoImp,
      impuestos: imp.impuestos,
      base: imp.base,
      ivaImporte: imp.ivaImporte,
      retIvaImporte: imp.retIvaImporte,
      retIsrImporte: imp.retIsrImporte,
      iepsImporte: imp.iepsImporte,
    };
  });
}

function parsePagos(comp: Nodo): PagoParsed[] {
  const complemento = nodo(comp, "Complemento");
  const pagosNode = complemento ? nodo(complemento, "Pagos") : undefined;
  if (!pagosNode) return [];
  return lista(pagosNode, "Pago").map((p) => ({
    fechaPago: attr(p, "FechaPago") ?? "",
    formaPago: attr(p, "FormaDePagoP") ?? "",
    moneda: attr(p, "MonedaP") ?? "MXN",
    monto: num(attr(p, "Monto")),
    doctos: lista(p, "DoctoRelacionado").map((d) => {
      const uuid = (attr(d, "IdDocumento") ?? "").toUpperCase();
      return {
        facturaId: uuid,
        uuid,
        serie: attr(d, "Serie"),
        folio: attr(d, "Folio"),
        parcialidad: Number(attr(d, "NumParcialidad") ?? 1) || 1,
        saldoAnterior: num(attr(d, "ImpSaldoAnt")),
        pagado: num(attr(d, "ImpPagado")),
        saldoInsoluto: num(attr(d, "ImpSaldoInsoluto")),
        objetoImpDR: (attr(d, "ObjetoImpDR") === "02" ? "02" : "01") as "01" | "02",
        impuestos: [] as ImpuestoDR[],
      };
    }),
  }));
}

/** Trabajador (receptor) del complemento de nómina, si el CFDI es de tipo N. */
function parseNomina(comp: Nodo): NominaParsed | undefined {
  const complemento = nodo(comp, "Complemento");
  const nom = complemento ? nodo(complemento, "Nomina") : undefined;
  if (!nom) return undefined;
  const rec = nodo(nom, "Receptor");
  const numDias = num(attr(nom, "NumDiasPagados")) || 1;
  // Salario diario estimado: percepción de sueldos (001) entre los días pagados.
  const perc = nodo(nom, "Percepciones");
  let sueldo = 0;
  if (perc) {
    for (const p of lista(perc, "Percepcion")) {
      if (attr(p, "TipoPercepcion") === "001") sueldo += num(attr(p, "ImporteGravado")) + num(attr(p, "ImporteExento"));
    }
  }
  const sdi = num(attr(rec, "SalarioDiarioIntegrado"));
  const salarioDiario = sueldo > 0 ? Math.round((sueldo / numDias) * 100) / 100 : sdi;
  return {
    curp: attr(rec, "Curp") ?? "",
    nss: attr(rec, "NumSeguridadSocial") ?? "",
    numEmpleado: attr(rec, "NumEmpleado") ?? "",
    fechaInicioLaboral: attr(rec, "FechaInicioRelLaboral") ?? "",
    tipoContrato: attr(rec, "TipoContrato") ?? "",
    tipoRegimen: attr(rec, "TipoRegimen") ?? "",
    periodicidadPago: attr(rec, "PeriodicidadPago") ?? "",
    riesgoPuesto: attr(rec, "RiesgoPuesto") ?? "",
    departamento: attr(rec, "Departamento"),
    puesto: attr(rec, "Puesto"),
    banco: attr(rec, "Banco"),
    cuentaBancaria: attr(rec, "CuentaBancaria"),
    sbc: num(attr(rec, "SalarioBaseCotApor")),
    sdi,
    numDiasPagados: numDias,
    fechaPago: attr(nom, "FechaPago") ?? "",
    periodoInicio: attr(nom, "FechaInicialPago") ?? "",
    periodoFin: attr(nom, "FechaFinalPago") ?? "",
    totalPercepciones: num(attr(nom, "TotalPercepciones")),
    totalDeducciones: num(attr(nom, "TotalDeducciones")),
    salarioDiario,
  };
}

/** CFDI completo para derivar clientes/productos/facturas/pagos. */
export function parseCfdiCompleto(xml: string): CfdiCompleto {
  const base = parseCfdiBasico(xml);
  const doc = parser.parse(xml) as Nodo;
  const comp = nodo(doc, "Comprobante")!;
  const complemento = nodo(comp, "Complemento");
  const tfd = complemento ? nodo(complemento, "TimbreFiscalDigital") : undefined;
  const emisor = nodo(comp, "Emisor");
  const receptor = nodo(comp, "Receptor");
  const impuestos = nodo(comp, "Impuestos");
  return {
    ...base,
    serie: attr(comp, "Serie"),
    folio: attr(comp, "Folio"),
    moneda: attr(comp, "Moneda") ?? "MXN",
    tipoCambio: attr(comp, "TipoCambio") ? num(attr(comp, "TipoCambio")) : undefined,
    usoCfdi: attr(receptor, "UsoCFDI"),
    subTotal: num(attr(comp, "SubTotal")),
    descuento: num(attr(comp, "Descuento")),
    totalTraslados: num(attr(impuestos, "TotalImpuestosTrasladados")),
    totalRetenciones: num(attr(impuestos, "TotalImpuestosRetenidos")),
    fechaTimbrado: attr(tfd, "FechaTimbrado"),
    emisorRegimen: attr(emisor, "RegimenFiscal"),
    receptorRegimen: attr(receptor, "RegimenFiscalReceptor"),
    receptorCp: attr(receptor, "DomicilioFiscalReceptor"),
    conceptos: parseConceptos(comp),
    pagos: parsePagos(comp),
    nomina: parseNomina(comp),
  };
}
