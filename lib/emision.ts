import { guardarArchivo, idEmitido } from "./archivos";
import { genId, getCliente, guardarFactura, incrementarFolio, getConfigPac } from "./repos";
import type { ConceptoFactura, ConfigPac, Emisor, Factura } from "./types";
import { calcularConcepto, calcularTotales, validarFactura, sellarFactura } from "./sat/facturacion";
import { fechaCfdi } from "./sat/importes";
import { timbrar } from "./sat/timbrado";

export interface ConceptoInput {
  productoId?: string;
  claveProdServ: string;
  claveUnidad: string;
  unidad?: string;
  noIdentificacion?: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  descuento?: number;
  objetoImp: string;
  impuestos: {
    ivaTasa: number | null;
    ivaExento: boolean;
    retIvaTasa: number | null;
    retIsrTasa: number | null;
    iepsTasa: number | null;
  };
}

export interface NuevaFacturaInput {
  emisorId: string;
  clienteId: string;
  conceptos: ConceptoInput[];
  tipoDeComprobante?: "I" | "E";
  formaPago: string;
  metodoPago: string;
  moneda?: string;
  tipoCambio?: number;
  condicionesDePago?: string;
  usoCfdi?: string;
  diasCredito?: number;
  informacionGlobal?: { periodicidad: string; meses: string; anio: string };
  relacionados?: { tipoRelacion: string; uuids: string[] };
}

export class ErrorValidacion extends Error {
  errores: string[];
  constructor(errores: string[]) {
    super(errores.join("\n"));
    this.errores = errores;
  }
}

function prepararConceptos(conceptos: ConceptoInput[]): ConceptoFactura[] {
  return conceptos.map((c) => {
    const base = {
      productoId: c.productoId,
      claveProdServ: String(c.claveProdServ).trim(),
      claveUnidad: String(c.claveUnidad).trim().toUpperCase(),
      unidad: c.unidad?.trim() || undefined,
      noIdentificacion: c.noIdentificacion?.trim() || undefined,
      descripcion: String(c.descripcion).trim(),
      cantidad: Number(c.cantidad),
      valorUnitario: Number(c.valorUnitario),
      descuento: Number(c.descuento || 0),
      objetoImp: c.objetoImp,
      impuestos: {
        ivaTasa: c.impuestos.ivaTasa === null ? null : Number(c.impuestos.ivaTasa),
        ivaExento: Boolean(c.impuestos.ivaExento),
        retIvaTasa: c.impuestos.retIvaTasa === null ? null : Number(c.impuestos.retIvaTasa),
        retIsrTasa: c.impuestos.retIsrTasa === null ? null : Number(c.impuestos.retIsrTasa),
        iepsTasa: c.impuestos.iepsTasa === null ? null : Number(c.impuestos.iepsTasa),
      },
    };
    const calculado = calcularConcepto(base);
    return { ...base, ...calculado };
  });
}

/**
 * Emite una factura completa para la empresa indicada: calcula, valida,
 * sella con el CSD y timbra con la configuración PAC del despacho.
 * La verificación de permisos sobre la empresa ocurre en la capa API.
 */
export async function emitirFactura(input: NuevaFacturaInput, empresa: Emisor): Promise<Factura> {
  const cliente = await getCliente(input.clienteId);
  if (!cliente || cliente.empresaId !== empresa.id) {
    throw new ErrorValidacion(["Selecciona un cliente válido de esta empresa."]);
  }
  if (!input.conceptos?.length) throw new ErrorValidacion(["Agrega al menos un concepto."]);

  const pac = await getConfigPac(empresa.despachoId);
  const conceptos = prepararConceptos(input.conceptos);
  const totales = calcularTotales(conceptos);
  const usoCfdi = input.usoCfdi || cliente.usoCfdi;
  const moneda = input.moneda || "MXN";

  const factura: Factura = {
    id: genId(),
    emisorId: empresa.id,
    clienteId: cliente.id,
    serie: empresa.serie,
    folio: String(empresa.folioActual),
    fecha: fechaCfdi(),
    tipoDeComprobante: input.tipoDeComprobante === "E" ? "E" : "I",
    formaPago: input.formaPago,
    metodoPago: input.metodoPago,
    moneda,
    tipoCambio: moneda !== "MXN" ? Number(input.tipoCambio) || undefined : undefined,
    condicionesDePago: input.condicionesDePago?.trim() || undefined,
    usoCfdi,
    diasCredito:
      input.metodoPago === "PPD" && Number.isInteger(input.diasCredito) && (input.diasCredito as number) > 0
        ? input.diasCredito
        : undefined,
    conceptos,
    subTotal: totales.subTotal,
    descuento: totales.descuento,
    totalTraslados: totales.totalTraslados,
    totalRetenciones: totales.totalRetenciones,
    total: totales.total,
    informacionGlobal: input.informacionGlobal,
    relacionados:
      input.relacionados && input.relacionados.uuids.length > 0 ? input.relacionados : undefined,
    estado: "borrador",
    demo: false,
    emisorRfc: empresa.rfc,
    emisorNombre: empresa.nombre,
    receptorRfc: cliente.rfc,
    receptorNombre: cliente.nombre,
    creadoEl: new Date().toISOString(),
  };

  if (moneda !== "MXN" && !factura.tipoCambio) {
    throw new ErrorValidacion(["Indica el tipo de cambio para monedas distintas a MXN."]);
  }

  const errores = validarFactura(empresa, cliente, factura, {
    permitirCsdVencido: pac.modo === "demo",
  });
  if (errores.length) throw new ErrorValidacion(errores);

  // Sellado con el CSD
  const sellado = sellarFactura(empresa, cliente, factura);
  factura.cadenaOriginal = sellado.cadenaOriginal;
  factura.selloCFD = sellado.sello;
  factura.noCertificado = sellado.noCertificado;
  factura.estado = "sellada";

  const xmlPath = idEmitido("factura", factura.id);
  const nombreXml = `${factura.id}.xml`;

  // Timbrado (PAC real o demo según configuración del despacho)
  try {
    const timbre = await timbrar(sellado.xml, pac);
    factura.uuid = timbre.uuid;
    factura.fechaTimbrado = timbre.fechaTimbrado;
    factura.selloSAT = timbre.selloSAT;
    factura.noCertificadoSAT = timbre.noCertificadoSAT;
    factura.rfcProvCertif = timbre.rfcProvCertif;
    factura.demo = timbre.demo;
    factura.estado = "timbrada";
    await guardarArchivo(xmlPath, "emitido", "application/xml", nombreXml, Buffer.from(timbre.xmlTimbrado, "utf8"), empresa.id);
  } catch (e) {
    factura.estado = "error";
    factura.errorMsg = e instanceof Error ? e.message : "Error al timbrar";
    await guardarArchivo(xmlPath, "emitido", "application/xml", nombreXml, Buffer.from(sellado.xml, "utf8"), empresa.id);
  }
  factura.xmlPath = xmlPath;

  await guardarFactura(factura);
  await incrementarFolio(empresa.id);
  return factura;
}

/** Reintenta el timbrado de una factura con error: re-sella con fecha nueva y vuelve al PAC. */
export async function reintentarTimbrado(factura: Factura, empresa: Emisor): Promise<Factura> {
  if (factura.estado !== "error" && factura.estado !== "sellada") {
    throw new ErrorValidacion(["Solo se pueden reintentar facturas con error de timbrado."]);
  }
  const cliente = await getCliente(factura.clienteId);
  if (!cliente) throw new ErrorValidacion(["El cliente de la factura ya no existe."]);
  const pac: ConfigPac = await getConfigPac(empresa.despachoId);

  factura.fecha = fechaCfdi();
  const sellado = sellarFactura(empresa, cliente, factura);
  factura.cadenaOriginal = sellado.cadenaOriginal;
  factura.selloCFD = sellado.sello;
  factura.noCertificado = sellado.noCertificado;

  const timbre = await timbrar(sellado.xml, pac);
  factura.uuid = timbre.uuid;
  factura.fechaTimbrado = timbre.fechaTimbrado;
  factura.selloSAT = timbre.selloSAT;
  factura.noCertificadoSAT = timbre.noCertificadoSAT;
  factura.rfcProvCertif = timbre.rfcProvCertif;
  factura.demo = timbre.demo;
  factura.estado = "timbrada";
  factura.errorMsg = undefined;

  const xmlPath = idEmitido("factura", factura.id);
  await guardarArchivo(xmlPath, "emitido", "application/xml", `${factura.id}.xml`, Buffer.from(timbre.xmlTimbrado, "utf8"), empresa.id);
  factura.xmlPath = xmlPath;

  await guardarFactura(factura);
  return factura;
}
