import type { Cliente, ConceptoFactura, Emisor, Factura } from "../types";
import type { ComprobanteCfdi, ConceptoCfdi, TrasladoCfdi, RetencionCfdi } from "./cfdi";
import { buildCfdiXml } from "./cfdi";
import { cadenaOriginal } from "./cadena-original";
import { sellarCadena, verificarSello, parseCertificado } from "./certificados";
import { bytesCertificado } from "./cert-bytes";
import { decryptSecret } from "../secret";
import { fmtCantidad, fmtImporte, fmtTasa, fmtTipoCambio, round2 } from "./importes";
import { usosPermitidos, REGIMENES_FISCALES } from "./catalogos";
import { validarRfc, esRfcGenerico, esPersonaMoral, RFC_GENERICO_NACIONAL } from "./rfc";

export const IMPUESTO_ISR = "001";
export const IMPUESTO_IVA = "002";
export const IMPUESTO_IEPS = "003";

/** Calcula importes, bases e impuestos de cada concepto (redondeo a 2 decimales). */
export function calcularConcepto(c: {
  cantidad: number;
  valorUnitario: number;
  descuento: number;
  objetoImp: string;
  impuestos: ConceptoFactura["impuestos"];
}): Pick<ConceptoFactura, "importe" | "base" | "ivaImporte" | "retIvaImporte" | "retIsrImporte" | "iepsImporte"> {
  const importe = round2(c.cantidad * c.valorUnitario);
  const base = round2(importe - (c.descuento || 0));
  const grava = c.objetoImp === "02";
  const iva = grava && !c.impuestos.ivaExento && c.impuestos.ivaTasa !== null
    ? round2(base * c.impuestos.ivaTasa)
    : 0;
  const ieps = grava && c.impuestos.iepsTasa ? round2(base * c.impuestos.iepsTasa) : 0;
  const retIva = grava && c.impuestos.retIvaTasa ? round2(base * c.impuestos.retIvaTasa) : 0;
  const retIsr = grava && c.impuestos.retIsrTasa ? round2(base * c.impuestos.retIsrTasa) : 0;
  return {
    importe,
    base,
    ivaImporte: iva,
    retIvaImporte: retIva,
    retIsrImporte: retIsr,
    iepsImporte: ieps,
  };
}

export interface TotalesFactura {
  subTotal: number;
  descuento: number;
  totalTraslados: number;
  totalRetenciones: number;
  total: number;
}

export function calcularTotales(conceptos: ConceptoFactura[]): TotalesFactura {
  const subTotal = round2(conceptos.reduce((s, c) => s + c.importe, 0));
  const descuento = round2(conceptos.reduce((s, c) => s + (c.descuento || 0), 0));
  const totalTraslados = round2(
    conceptos.reduce((s, c) => s + c.ivaImporte + c.iepsImporte, 0),
  );
  const totalRetenciones = round2(
    conceptos.reduce((s, c) => s + c.retIvaImporte + c.retIsrImporte, 0),
  );
  const total = round2(subTotal - descuento + totalTraslados - totalRetenciones);
  return { subTotal, descuento, totalTraslados, totalRetenciones, total };
}

/** Validaciones de negocio previas a la emisión (reglas CFDI 4.0). */
export function validarFactura(emisor: Emisor, cliente: Cliente, factura: {
  conceptos: ConceptoFactura[];
  usoCfdi: string;
  metodoPago: string;
  formaPago: string;
  informacionGlobal?: Factura["informacionGlobal"];
}, opciones?: { permitirCsdVencido?: boolean }): string[] {
  const errores: string[] = [];

  if (!emisor.csd) {
    errores.push("El emisor no tiene un CSD cargado. Sube el certificado de sello digital en la sección Emisores.");
  } else {
    const hasta = new Date(emisor.csd.validoHasta);
    // En modo demo se permite sellar con CSD vencido (los certificados de prueba
    // del SAT suelen estarlo); un PAC real lo rechazaría de todos modos.
    if (hasta < new Date() && !opciones?.permitirCsdVencido) {
      errores.push(`El CSD del emisor venció el ${hasta.toLocaleDateString("es-MX")}. Renuévalo en el SAT (en modo demo puedes seguir probando).`);
    }
  }

  const rfcE = validarRfc(emisor.rfc);
  if (!rfcE.valido) errores.push(`RFC del emisor: ${rfcE.errores.join(", ")}`);
  const rfcR = validarRfc(cliente.rfc);
  if (!rfcR.valido) errores.push(`RFC del receptor: ${rfcR.errores.join(", ")}`);

  if (!/^\d{5}$/.test(emisor.codigoPostal)) errores.push("El lugar de expedición debe ser un código postal de 5 dígitos.");
  if (!/^\d{5}$/.test(cliente.codigoPostal)) errores.push("El domicilio fiscal del receptor debe ser un código postal de 5 dígitos.");

  if (factura.conceptos.length === 0) errores.push("Agrega al menos un concepto.");
  for (const [i, c] of factura.conceptos.entries()) {
    if (!(c.cantidad > 0)) errores.push(`Concepto ${i + 1}: la cantidad debe ser mayor a cero.`);
    if (c.valorUnitario < 0) errores.push(`Concepto ${i + 1}: el valor unitario no puede ser negativo.`);
    if (!/^\d{8}$/.test(c.claveProdServ)) errores.push(`Concepto ${i + 1}: la clave de producto/servicio debe tener 8 dígitos.`);
    if (!c.descripcion.trim()) errores.push(`Concepto ${i + 1}: falta la descripción.`);
    if ((c.descuento || 0) > c.cantidad * c.valorUnitario) {
      errores.push(`Concepto ${i + 1}: el descuento no puede ser mayor al importe.`);
    }
  }

  // Compatibilidad uso CFDI ↔ régimen del receptor
  if (!esRfcGenerico(cliente.rfc)) {
    const usos = usosPermitidos(cliente.regimenFiscal, esPersonaMoral(cliente.rfc));
    if (!usos.some((u) => u.clave === factura.usoCfdi) && factura.usoCfdi !== "S01" && factura.usoCfdi !== "CP01") {
      errores.push(
        `El uso de CFDI "${factura.usoCfdi}" no es compatible con el régimen ${cliente.regimenFiscal} del receptor.`,
      );
    }
    const regimen = REGIMENES_FISCALES.find((r) => r.clave === cliente.regimenFiscal);
    if (regimen) {
      const esMoral = esPersonaMoral(cliente.rfc);
      if (esMoral && !regimen.moral) errores.push(`El régimen ${regimen.clave} no aplica para personas morales.`);
      if (!esMoral && !regimen.fisica) errores.push(`El régimen ${regimen.clave} no aplica para personas físicas.`);
    }
  } else if (cliente.rfc === RFC_GENERICO_NACIONAL && !factura.informacionGlobal) {
    errores.push(
      "Para el RFC genérico XAXX010101000 el SAT exige factura global: indica periodicidad, mes y año.",
    );
  }

  if (factura.metodoPago === "PPD" && factura.formaPago !== "99") {
    errores.push('Con método de pago PPD la forma de pago debe ser "99 - Por definir".');
  }

  return errores;
}

/** Construye la representación intermedia del comprobante a partir de la factura. */
export function construirComprobante(
  emisor: Emisor,
  cliente: Cliente,
  factura: Factura,
  certificadoBase64: string,
  noCertificado: string,
): ComprobanteCfdi {
  const conceptos: ConceptoCfdi[] = factura.conceptos.map((c) => {
    const traslados: TrasladoCfdi[] = [];
    const retenciones: RetencionCfdi[] = [];
    if (c.objetoImp === "02") {
      if (c.impuestos.ivaExento) {
        traslados.push({ Base: fmtImporte(c.base), Impuesto: IMPUESTO_IVA, TipoFactor: "Exento" });
      } else if (c.impuestos.ivaTasa !== null) {
        traslados.push({
          Base: fmtImporte(c.base),
          Impuesto: IMPUESTO_IVA,
          TipoFactor: "Tasa",
          TasaOCuota: fmtTasa(c.impuestos.ivaTasa),
          Importe: fmtImporte(c.ivaImporte),
        });
      }
      if (c.impuestos.iepsTasa) {
        traslados.push({
          Base: fmtImporte(c.base),
          Impuesto: IMPUESTO_IEPS,
          TipoFactor: "Tasa",
          TasaOCuota: fmtTasa(c.impuestos.iepsTasa),
          Importe: fmtImporte(c.iepsImporte),
        });
      }
      if (c.impuestos.retIsrTasa) {
        retenciones.push({
          Base: fmtImporte(c.base),
          Impuesto: IMPUESTO_ISR,
          TipoFactor: "Tasa",
          TasaOCuota: fmtTasa(c.impuestos.retIsrTasa),
          Importe: fmtImporte(c.retIsrImporte),
        });
      }
      if (c.impuestos.retIvaTasa) {
        retenciones.push({
          Base: fmtImporte(c.base),
          Impuesto: IMPUESTO_IVA,
          TipoFactor: "Tasa",
          TasaOCuota: fmtTasa(c.impuestos.retIvaTasa),
          Importe: fmtImporte(c.retIvaImporte),
        });
      }
    }
    return {
      ClaveProdServ: c.claveProdServ,
      NoIdentificacion: c.noIdentificacion || undefined,
      Cantidad: fmtCantidad(c.cantidad),
      ClaveUnidad: c.claveUnidad,
      Unidad: c.unidad || undefined,
      Descripcion: c.descripcion.replace(/\s+/g, " ").trim(),
      ValorUnitario: fmtImporte(c.valorUnitario),
      Importe: fmtImporte(c.importe),
      Descuento: c.descuento > 0 ? fmtImporte(c.descuento) : undefined,
      ObjetoImp: c.objetoImp,
      Traslados: traslados.length ? traslados : undefined,
      Retenciones: retenciones.length ? retenciones : undefined,
    };
  });

  // Agrupación de traslados totales por impuesto + tipo factor + tasa
  const gruposTraslados = new Map<string, { base: number; importe: number; t: TrasladoCfdi }>();
  const gruposRetenciones = new Map<string, number>();
  for (const c of factura.conceptos) {
    if (c.objetoImp !== "02") continue;
    if (c.impuestos.ivaExento) {
      const k = `${IMPUESTO_IVA}|Exento|`;
      const g = gruposTraslados.get(k) ?? {
        base: 0,
        importe: 0,
        t: { Base: "", Impuesto: IMPUESTO_IVA, TipoFactor: "Exento" },
      };
      g.base = round2(g.base + c.base);
      gruposTraslados.set(k, g);
    } else if (c.impuestos.ivaTasa !== null) {
      const k = `${IMPUESTO_IVA}|Tasa|${fmtTasa(c.impuestos.ivaTasa)}`;
      const g = gruposTraslados.get(k) ?? {
        base: 0,
        importe: 0,
        t: {
          Base: "",
          Impuesto: IMPUESTO_IVA,
          TipoFactor: "Tasa",
          TasaOCuota: fmtTasa(c.impuestos.ivaTasa),
        },
      };
      g.base = round2(g.base + c.base);
      g.importe = round2(g.importe + c.ivaImporte);
      gruposTraslados.set(k, g);
    }
    if (c.impuestos.iepsTasa) {
      const k = `${IMPUESTO_IEPS}|Tasa|${fmtTasa(c.impuestos.iepsTasa)}`;
      const g = gruposTraslados.get(k) ?? {
        base: 0,
        importe: 0,
        t: {
          Base: "",
          Impuesto: IMPUESTO_IEPS,
          TipoFactor: "Tasa",
          TasaOCuota: fmtTasa(c.impuestos.iepsTasa),
        },
      };
      g.base = round2(g.base + c.base);
      g.importe = round2(g.importe + c.iepsImporte);
      gruposTraslados.set(k, g);
    }
    if (c.retIsrImporte > 0) {
      gruposRetenciones.set(IMPUESTO_ISR, round2((gruposRetenciones.get(IMPUESTO_ISR) ?? 0) + c.retIsrImporte));
    }
    if (c.retIvaImporte > 0) {
      gruposRetenciones.set(IMPUESTO_IVA, round2((gruposRetenciones.get(IMPUESTO_IVA) ?? 0) + c.retIvaImporte));
    }
  }

  const trasladosTotales = [...gruposTraslados.values()].map((g) => ({
    ...g.t,
    Base: fmtImporte(g.base),
    Importe: g.t.TipoFactor === "Exento" ? undefined : fmtImporte(g.importe),
  }));
  const retencionesTotales = [...gruposRetenciones.entries()].map(([imp, importe]) => ({
    Impuesto: imp,
    Importe: fmtImporte(importe),
  }));
  const totalTraslados = round2(
    [...gruposTraslados.values()]
      .filter((g) => g.t.TipoFactor !== "Exento")
      .reduce((s, g) => s + g.importe, 0),
  );
  const totalRetenciones = round2([...gruposRetenciones.values()].reduce((s, v) => s + v, 0));
  const hayImpuestos = trasladosTotales.length > 0 || retencionesTotales.length > 0;
  const hayTrasladosGravados = [...gruposTraslados.values()].some((g) => g.t.TipoFactor !== "Exento");

  return {
    Version: "4.0",
    Serie: factura.serie || undefined,
    Folio: factura.folio || undefined,
    Fecha: factura.fecha,
    FormaPago: factura.formaPago || undefined,
    NoCertificado: noCertificado,
    Certificado: certificadoBase64,
    CondicionesDePago: factura.condicionesDePago || undefined,
    SubTotal: fmtImporte(factura.subTotal),
    Descuento: factura.descuento > 0 ? fmtImporte(factura.descuento) : undefined,
    Moneda: factura.moneda,
    TipoCambio:
      factura.moneda !== "MXN" && factura.tipoCambio ? fmtTipoCambio(factura.tipoCambio) : undefined,
    Total: fmtImporte(factura.total),
    TipoDeComprobante: factura.tipoDeComprobante,
    Exportacion: "01",
    MetodoPago: factura.metodoPago || undefined,
    LugarExpedicion: emisor.codigoPostal,
    InformacionGlobal: factura.informacionGlobal
      ? {
          Periodicidad: factura.informacionGlobal.periodicidad,
          Meses: factura.informacionGlobal.meses,
          Anio: factura.informacionGlobal.anio,
        }
      : undefined,
    CfdiRelacionados:
      factura.relacionados && factura.relacionados.uuids.length > 0
        ? { TipoRelacion: factura.relacionados.tipoRelacion, UUIDs: factura.relacionados.uuids }
        : undefined,
    Emisor: {
      Rfc: emisor.rfc,
      Nombre: emisor.nombre.replace(/\s+/g, " ").trim().toUpperCase(),
      RegimenFiscal: emisor.regimenFiscal,
    },
    Receptor: {
      Rfc: cliente.rfc,
      Nombre: cliente.nombre.replace(/\s+/g, " ").trim().toUpperCase(),
      DomicilioFiscalReceptor: cliente.codigoPostal,
      ResidenciaFiscal: cliente.extranjero ? cliente.residenciaFiscal : undefined,
      NumRegIdTrib: cliente.extranjero ? cliente.numRegIdTrib : undefined,
      RegimenFiscalReceptor: cliente.regimenFiscal,
      UsoCFDI: factura.usoCfdi,
    },
    Conceptos: conceptos,
    Impuestos: hayImpuestos
      ? {
          Retenciones: retencionesTotales.length ? retencionesTotales : undefined,
          TotalImpuestosRetenidos: retencionesTotales.length ? fmtImporte(totalRetenciones) : undefined,
          Traslados: trasladosTotales.length ? trasladosTotales : undefined,
          TotalImpuestosTrasladados: hayTrasladosGravados ? fmtImporte(totalTraslados) : undefined,
        }
      : undefined,
  };
}

export interface ResultadoSellado {
  xml: string;
  cadenaOriginal: string;
  sello: string;
  noCertificado: string;
}

/** Genera la cadena original, sella con el CSD y produce el XML final. */
export function sellarFactura(emisor: Emisor, cliente: Cliente, factura: Factura): ResultadoSellado {
  if (!emisor.csd) throw new Error("El emisor no tiene CSD cargado.");
  const { cer: cerBuffer, key: keyBuffer } = bytesCertificado(emisor, "csd");
  const password = decryptSecret(emisor.csd.passwordEnc);
  const cert = parseCertificado(cerBuffer);

  const comprobante = construirComprobante(
    emisor,
    cliente,
    factura,
    cert.certificadoBase64,
    cert.noCertificado,
  );
  const cadena = cadenaOriginal(comprobante);
  const sello = sellarCadena(keyBuffer, password, cadena);

  if (!verificarSello(cert.certificadoBase64, cadena, sello)) {
    throw new Error("El sello generado no pudo verificarse contra el certificado. Revisa el CSD.");
  }

  comprobante.Sello = sello;
  return {
    xml: buildCfdiXml(comprobante),
    cadenaOriginal: cadena,
    sello,
    noCertificado: cert.noCertificado,
  };
}
