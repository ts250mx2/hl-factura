import { XMLParser } from "fast-xml-parser";
import type { ComprobanteCfdi, ConceptoCfdi, TrasladoCfdi, RetencionCfdi } from "./cfdi";
import { cadenaOriginal } from "./cadena-original";
import { verificarSello } from "./certificados";

// Validador de CFDI: lee cualquier XML de CFDI 4.0, extrae sus datos, reconstruye
// la cadena original y verifica el sello digital contra el certificado incluido.

export interface ReporteValidacion {
  version: string;
  esCfdi40: boolean;
  emisor: { rfc: string; nombre: string; regimen: string };
  receptor: { rfc: string; nombre: string; usoCfdi: string };
  serie?: string;
  folio?: string;
  fecha: string;
  subTotal: string;
  total: string;
  moneda: string;
  tipoDeComprobante: string;
  conceptos: { descripcion: string; cantidad: string; importe: string }[];
  timbrado: boolean;
  uuid?: string;
  fechaTimbrado?: string;
  rfcProvCertif?: string;
  selloCFD?: string;
  // resultado de la verificación
  selloVerificable: boolean;
  selloValido?: boolean;
  motivoNoVerificable?: string;
  advertencias: string[];
}

type Nodo = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  isArray: (name) =>
    ["Concepto", "Traslado", "Retencion", "CfdiRelacionado", "CfdiRelacionados"].includes(name),
  parseAttributeValue: false,
  parseTagValue: false,
});

function attr(n: Nodo | undefined, name: string): string | undefined {
  const v = n?.[`@${name}`];
  return v === undefined ? undefined : String(v);
}

function nodo(n: Nodo | undefined, name: string): Nodo | undefined {
  const v = n?.[name];
  if (v === undefined) return undefined;
  return (Array.isArray(v) ? v[0] : v) as Nodo;
}

function lista(n: Nodo | undefined, name: string): Nodo[] {
  const v = n?.[name];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]) as Nodo[];
}

function mapTraslado(t: Nodo): TrasladoCfdi {
  return {
    Base: attr(t, "Base") ?? "",
    Impuesto: attr(t, "Impuesto") ?? "",
    TipoFactor: attr(t, "TipoFactor") ?? "",
    TasaOCuota: attr(t, "TasaOCuota"),
    Importe: attr(t, "Importe"),
  };
}

export function validarCfdiXml(xml: string): ReporteValidacion {
  const doc = parser.parse(xml) as Nodo;
  const comp = nodo(doc, "Comprobante");
  if (!comp) throw new Error("El archivo no es un CFDI: no se encontró el nodo Comprobante.");

  const version = attr(comp, "Version") ?? attr(comp, "version") ?? "";
  const emisor = nodo(comp, "Emisor");
  const receptor = nodo(comp, "Receptor");
  const conceptosNodo = nodo(comp, "Conceptos");
  const conceptos = lista(conceptosNodo, "Concepto");
  const complemento = nodo(comp, "Complemento");
  const tfd = complemento ? nodo(complemento, "TimbreFiscalDigital") : undefined;
  const advertencias: string[] = [];

  const reporte: ReporteValidacion = {
    version,
    esCfdi40: version === "4.0",
    emisor: {
      rfc: attr(emisor, "Rfc") ?? "",
      nombre: attr(emisor, "Nombre") ?? "",
      regimen: attr(emisor, "RegimenFiscal") ?? "",
    },
    receptor: {
      rfc: attr(receptor, "Rfc") ?? "",
      nombre: attr(receptor, "Nombre") ?? "",
      usoCfdi: attr(receptor, "UsoCFDI") ?? "",
    },
    serie: attr(comp, "Serie"),
    folio: attr(comp, "Folio"),
    fecha: attr(comp, "Fecha") ?? "",
    subTotal: attr(comp, "SubTotal") ?? "",
    total: attr(comp, "Total") ?? "",
    moneda: attr(comp, "Moneda") ?? "",
    tipoDeComprobante: attr(comp, "TipoDeComprobante") ?? "",
    conceptos: conceptos.map((c) => ({
      descripcion: attr(c, "Descripcion") ?? "",
      cantidad: attr(c, "Cantidad") ?? "",
      importe: attr(c, "Importe") ?? "",
    })),
    timbrado: Boolean(tfd),
    uuid: attr(tfd, "UUID"),
    fechaTimbrado: attr(tfd, "FechaTimbrado"),
    rfcProvCertif: attr(tfd, "RfcProvCertif"),
    selloCFD: attr(comp, "Sello"),
    selloVerificable: false,
    advertencias,
  };

  if (!reporte.timbrado) advertencias.push("El CFDI no está timbrado (no contiene Timbre Fiscal Digital).");
  if (version !== "4.0") {
    reporte.motivoNoVerificable = `Solo se verifica el sello de CFDI 4.0 (este es ${version || "desconocido"}).`;
    return reporte;
  }

  // Si hay complementos distintos al TFD, la cadena original incluiría su contenido
  // y no podemos reconstruirla con fidelidad.
  if (complemento) {
    const otros = Object.keys(complemento).filter(
      (k) => !k.startsWith("@") && k !== "TimbreFiscalDigital",
    );
    if (otros.length > 0) {
      reporte.motivoNoVerificable = `El CFDI tiene complementos (${otros.join(", ")}) y la verificación local del sello no está disponible; usa la consulta al SAT.`;
      return reporte;
    }
  }
  if (nodo(comp, "Addenda")) {
    advertencias.push("El CFDI contiene una Addenda (no afecta el sello).");
  }

  const sello = attr(comp, "Sello");
  const certificado = attr(comp, "Certificado");
  if (!sello || !certificado) {
    reporte.motivoNoVerificable = "El CFDI no incluye Sello o Certificado.";
    return reporte;
  }

  const infoGlobal = nodo(comp, "InformacionGlobal");
  const relacionadosNodos = lista(comp, "CfdiRelacionados");
  if (relacionadosNodos.length > 1) {
    reporte.motivoNoVerificable =
      "El CFDI tiene múltiples nodos CfdiRelacionados; verificación local no disponible.";
    return reporte;
  }
  const relacionados = relacionadosNodos[0];

  const impuestosTotales = nodo(comp, "Impuestos");

  const comprobante: ComprobanteCfdi = {
    Version: "4.0",
    Serie: attr(comp, "Serie"),
    Folio: attr(comp, "Folio"),
    Fecha: attr(comp, "Fecha") ?? "",
    FormaPago: attr(comp, "FormaPago"),
    NoCertificado: attr(comp, "NoCertificado") ?? "",
    Certificado: certificado,
    CondicionesDePago: attr(comp, "CondicionesDePago"),
    SubTotal: attr(comp, "SubTotal") ?? "",
    Descuento: attr(comp, "Descuento"),
    Moneda: attr(comp, "Moneda") ?? "",
    TipoCambio: attr(comp, "TipoCambio"),
    Total: attr(comp, "Total") ?? "",
    TipoDeComprobante: attr(comp, "TipoDeComprobante") ?? "",
    Exportacion: attr(comp, "Exportacion") ?? "",
    MetodoPago: attr(comp, "MetodoPago"),
    LugarExpedicion: attr(comp, "LugarExpedicion") ?? "",
    InformacionGlobal: infoGlobal
      ? {
          Periodicidad: attr(infoGlobal, "Periodicidad") ?? "",
          Meses: attr(infoGlobal, "Meses") ?? "",
          Anio: attr(infoGlobal, "Año") ?? "",
        }
      : undefined,
    CfdiRelacionados: relacionados
      ? {
          TipoRelacion: attr(relacionados, "TipoRelacion") ?? "",
          UUIDs: lista(relacionados, "CfdiRelacionado").map((r) => attr(r, "UUID") ?? ""),
        }
      : undefined,
    Emisor: {
      Rfc: reporte.emisor.rfc,
      Nombre: reporte.emisor.nombre,
      RegimenFiscal: reporte.emisor.regimen,
    },
    Receptor: {
      Rfc: reporte.receptor.rfc,
      Nombre: reporte.receptor.nombre,
      DomicilioFiscalReceptor: attr(receptor, "DomicilioFiscalReceptor") ?? "",
      ResidenciaFiscal: attr(receptor, "ResidenciaFiscal"),
      NumRegIdTrib: attr(receptor, "NumRegIdTrib"),
      RegimenFiscalReceptor: attr(receptor, "RegimenFiscalReceptor") ?? "",
      UsoCFDI: reporte.receptor.usoCfdi,
    },
    Conceptos: conceptos.map((c): ConceptoCfdi => {
      const imp = nodo(c, "Impuestos");
      const traslados = lista(nodo(imp, "Traslados"), "Traslado").map(mapTraslado);
      const retenciones = lista(nodo(imp, "Retenciones"), "Retencion").map(
        (r): RetencionCfdi => ({
          Base: attr(r, "Base") ?? "",
          Impuesto: attr(r, "Impuesto") ?? "",
          TipoFactor: attr(r, "TipoFactor") ?? "",
          TasaOCuota: attr(r, "TasaOCuota") ?? "",
          Importe: attr(r, "Importe") ?? "",
        }),
      );
      if (nodo(c, "ACuentaTerceros") || nodo(c, "InformacionAduanera") || nodo(c, "CuentaPredial") || nodo(c, "Parte")) {
        throw new Error("no-verificable");
      }
      return {
        ClaveProdServ: attr(c, "ClaveProdServ") ?? "",
        NoIdentificacion: attr(c, "NoIdentificacion"),
        Cantidad: attr(c, "Cantidad") ?? "",
        ClaveUnidad: attr(c, "ClaveUnidad") ?? "",
        Unidad: attr(c, "Unidad"),
        Descripcion: attr(c, "Descripcion") ?? "",
        ValorUnitario: attr(c, "ValorUnitario") ?? "",
        Importe: attr(c, "Importe") ?? "",
        Descuento: attr(c, "Descuento"),
        ObjetoImp: attr(c, "ObjetoImp") ?? "",
        Traslados: traslados.length ? traslados : undefined,
        Retenciones: retenciones.length ? retenciones : undefined,
      };
    }),
    Impuestos: impuestosTotales
      ? {
          Retenciones: lista(nodo(impuestosTotales, "Retenciones"), "Retencion").map((r) => ({
            Impuesto: attr(r, "Impuesto") ?? "",
            Importe: attr(r, "Importe") ?? "",
          })),
          TotalImpuestosRetenidos: attr(impuestosTotales, "TotalImpuestosRetenidos"),
          Traslados: lista(nodo(impuestosTotales, "Traslados"), "Traslado").map(mapTraslado),
          TotalImpuestosTrasladados: attr(impuestosTotales, "TotalImpuestosTrasladados"),
        }
      : undefined,
  };

  if (comprobante.Impuestos) {
    if (comprobante.Impuestos.Retenciones?.length === 0) comprobante.Impuestos.Retenciones = undefined;
    if (comprobante.Impuestos.Traslados?.length === 0) comprobante.Impuestos.Traslados = undefined;
  }

  try {
    const cadena = cadenaOriginal(comprobante);
    reporte.selloVerificable = true;
    reporte.selloValido = verificarSello(certificado, cadena, sello);
  } catch (e) {
    reporte.motivoNoVerificable =
      e instanceof Error && e.message === "no-verificable"
        ? "El CFDI usa nodos (a cuenta de terceros, aduanas, predial o partes) fuera del alcance de la verificación local."
        : "No fue posible reconstruir la cadena original de este CFDI.";
    reporte.selloVerificable = false;
  }

  return reporte;
}
