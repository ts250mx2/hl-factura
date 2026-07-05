import type { ComprobanteCfdi } from "./cfdi";

// Genera la cadena original del CFDI 4.0 siguiendo la secuencia del XSLT
// oficial del SAT (cadenaoriginal_4_0.xslt): atributos requeridos siempre,
// opcionales solo si están presentes, valores con espacios normalizados,
// delimitados por "|" y envueltos en "||...||".

function norm(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/** Acumulador de partes: requeridas siempre, opcionales solo si existen. */
export function nuevoAcumulador() {
  const partes: string[] = [];
  return {
    partes,
    req: (v: string) => partes.push(norm(v)),
    opc: (v?: string) => {
      if (v !== undefined && v !== null && v !== "") partes.push(norm(v));
    },
  };
}

/** Secuencia de partes del nodo Comprobante (sin envolver en ||…||). */
export function partesComprobante(c: ComprobanteCfdi): string[] {
  const { partes, req, opc } = nuevoAcumulador();

  // Comprobante
  req(c.Version);
  opc(c.Serie);
  opc(c.Folio);
  req(c.Fecha);
  opc(c.FormaPago);
  req(c.NoCertificado);
  opc(c.CondicionesDePago);
  req(c.SubTotal);
  opc(c.Descuento);
  req(c.Moneda);
  opc(c.TipoCambio);
  req(c.Total);
  req(c.TipoDeComprobante);
  req(c.Exportacion);
  opc(c.MetodoPago);
  req(c.LugarExpedicion);

  // InformacionGlobal
  if (c.InformacionGlobal) {
    req(c.InformacionGlobal.Periodicidad);
    req(c.InformacionGlobal.Meses);
    req(c.InformacionGlobal.Anio);
  }

  // CfdiRelacionados
  if (c.CfdiRelacionados && c.CfdiRelacionados.UUIDs.length > 0) {
    req(c.CfdiRelacionados.TipoRelacion);
    for (const uuid of c.CfdiRelacionados.UUIDs) req(uuid);
  }

  // Emisor
  req(c.Emisor.Rfc);
  req(c.Emisor.Nombre);
  req(c.Emisor.RegimenFiscal);

  // Receptor
  req(c.Receptor.Rfc);
  req(c.Receptor.Nombre);
  req(c.Receptor.DomicilioFiscalReceptor);
  opc(c.Receptor.ResidenciaFiscal);
  opc(c.Receptor.NumRegIdTrib);
  req(c.Receptor.RegimenFiscalReceptor);
  req(c.Receptor.UsoCFDI);

  // Conceptos
  for (const con of c.Conceptos) {
    req(con.ClaveProdServ);
    opc(con.NoIdentificacion);
    req(con.Cantidad);
    req(con.ClaveUnidad);
    opc(con.Unidad);
    req(con.Descripcion);
    req(con.ValorUnitario);
    req(con.Importe);
    opc(con.Descuento);
    req(con.ObjetoImp);
    if (con.Traslados) {
      for (const t of con.Traslados) {
        req(t.Base);
        req(t.Impuesto);
        req(t.TipoFactor);
        opc(t.TasaOCuota);
        opc(t.Importe);
      }
    }
    if (con.Retenciones) {
      for (const r of con.Retenciones) {
        req(r.Base);
        req(r.Impuesto);
        req(r.TipoFactor);
        req(r.TasaOCuota);
        req(r.Importe);
      }
    }
  }

  // Impuestos (totales): primero retenciones, luego total retenido,
  // después traslados y total trasladado — así lo dicta el XSLT del SAT.
  if (c.Impuestos) {
    if (c.Impuestos.Retenciones) {
      for (const r of c.Impuestos.Retenciones) {
        req(r.Impuesto);
        req(r.Importe);
      }
    }
    opc(c.Impuestos.TotalImpuestosRetenidos);
    if (c.Impuestos.Traslados) {
      for (const t of c.Impuestos.Traslados) {
        req(t.Base);
        req(t.Impuesto);
        req(t.TipoFactor);
        opc(t.TasaOCuota);
        opc(t.Importe);
      }
    }
    opc(c.Impuestos.TotalImpuestosTrasladados);
  }

  return partes;
}

export function cadenaOriginal(c: ComprobanteCfdi): string {
  return `||${partesComprobante(c).join("|")}||`;
}

/** Cadena original del Timbre Fiscal Digital 1.1 (para la representación impresa). */
export function cadenaOriginalTfd(tfd: {
  UUID: string;
  FechaTimbrado: string;
  RfcProvCertif: string;
  SelloCFD: string;
  NoCertificadoSAT: string;
}): string {
  return `||1.1|${tfd.UUID}|${tfd.FechaTimbrado}|${tfd.RfcProvCertif}|${tfd.SelloCFD}|${tfd.NoCertificadoSAT}||`;
}
