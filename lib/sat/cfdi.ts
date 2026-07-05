// Representación intermedia del CFDI 4.0, serialización XML y cadena original.
// El XML y la cadena original se generan desde la MISMA estructura, lo que
// garantiza que el sello digital siempre corresponda al XML emitido.

export interface TrasladoCfdi {
  Base: string;
  Impuesto: string; // 001 ISR, 002 IVA, 003 IEPS
  TipoFactor: string; // Tasa | Cuota | Exento
  TasaOCuota?: string;
  Importe?: string;
}

export interface RetencionCfdi {
  Base: string;
  Impuesto: string;
  TipoFactor: string;
  TasaOCuota: string;
  Importe: string;
}

export interface ConceptoCfdi {
  ClaveProdServ: string;
  NoIdentificacion?: string;
  Cantidad: string;
  ClaveUnidad: string;
  Unidad?: string;
  Descripcion: string;
  ValorUnitario: string;
  Importe: string;
  Descuento?: string;
  ObjetoImp: string;
  Traslados?: TrasladoCfdi[];
  Retenciones?: RetencionCfdi[];
}

export interface ComprobanteCfdi {
  Version: "4.0";
  Serie?: string;
  Folio?: string;
  Fecha: string;
  Sello?: string;
  FormaPago?: string;
  NoCertificado: string;
  Certificado: string;
  CondicionesDePago?: string;
  SubTotal: string;
  Descuento?: string;
  Moneda: string;
  TipoCambio?: string;
  Total: string;
  TipoDeComprobante: string;
  Exportacion: string;
  MetodoPago?: string;
  LugarExpedicion: string;
  InformacionGlobal?: { Periodicidad: string; Meses: string; Anio: string };
  CfdiRelacionados?: { TipoRelacion: string; UUIDs: string[] };
  Emisor: { Rfc: string; Nombre: string; RegimenFiscal: string };
  Receptor: {
    Rfc: string;
    Nombre: string;
    DomicilioFiscalReceptor: string;
    ResidenciaFiscal?: string;
    NumRegIdTrib?: string;
    RegimenFiscalReceptor: string;
    UsoCFDI: string;
  };
  Conceptos: ConceptoCfdi[];
  Impuestos?: {
    Retenciones?: { Impuesto: string; Importe: string }[];
    TotalImpuestosRetenidos?: string;
    Traslados?: TrasladoCfdi[];
    TotalImpuestosTrasladados?: string;
  };
}

export function escapeXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attrs(pairs: [string, string | undefined][]): string {
  return pairs
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => ` ${k}="${escapeXml(v as string)}"`)
    .join("");
}

function trasladoXml(t: TrasladoCfdi, indent: string): string {
  return `${indent}<cfdi:Traslado${attrs([
    ["Base", t.Base],
    ["Impuesto", t.Impuesto],
    ["TipoFactor", t.TipoFactor],
    ["TasaOCuota", t.TasaOCuota],
    ["Importe", t.Importe],
  ])}/>`;
}

/** Serializa el comprobante a XML CFDI 4.0. */
export function buildCfdiXml(c: ComprobanteCfdi): string {
  const lineas: string[] = [];
  lineas.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lineas.push(
    `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"` +
      attrs([
        ["Version", c.Version],
        ["Serie", c.Serie],
        ["Folio", c.Folio],
        ["Fecha", c.Fecha],
        ["Sello", c.Sello],
        ["FormaPago", c.FormaPago],
        ["NoCertificado", c.NoCertificado],
        ["Certificado", c.Certificado],
        ["CondicionesDePago", c.CondicionesDePago],
        ["SubTotal", c.SubTotal],
        ["Descuento", c.Descuento],
        ["Moneda", c.Moneda],
        ["TipoCambio", c.TipoCambio],
        ["Total", c.Total],
        ["TipoDeComprobante", c.TipoDeComprobante],
        ["Exportacion", c.Exportacion],
        ["MetodoPago", c.MetodoPago],
        ["LugarExpedicion", c.LugarExpedicion],
      ]) +
      `>`,
  );

  if (c.InformacionGlobal) {
    lineas.push(
      `  <cfdi:InformacionGlobal${attrs([
        ["Periodicidad", c.InformacionGlobal.Periodicidad],
        ["Meses", c.InformacionGlobal.Meses],
        ["Año", c.InformacionGlobal.Anio],
      ])}/>`,
    );
  }

  if (c.CfdiRelacionados && c.CfdiRelacionados.UUIDs.length > 0) {
    lineas.push(
      `  <cfdi:CfdiRelacionados${attrs([["TipoRelacion", c.CfdiRelacionados.TipoRelacion]])}>`,
    );
    for (const uuid of c.CfdiRelacionados.UUIDs) {
      lineas.push(`    <cfdi:CfdiRelacionado${attrs([["UUID", uuid]])}/>`);
    }
    lineas.push(`  </cfdi:CfdiRelacionados>`);
  }

  lineas.push(
    `  <cfdi:Emisor${attrs([
      ["Rfc", c.Emisor.Rfc],
      ["Nombre", c.Emisor.Nombre],
      ["RegimenFiscal", c.Emisor.RegimenFiscal],
    ])}/>`,
  );

  lineas.push(
    `  <cfdi:Receptor${attrs([
      ["Rfc", c.Receptor.Rfc],
      ["Nombre", c.Receptor.Nombre],
      ["DomicilioFiscalReceptor", c.Receptor.DomicilioFiscalReceptor],
      ["ResidenciaFiscal", c.Receptor.ResidenciaFiscal],
      ["NumRegIdTrib", c.Receptor.NumRegIdTrib],
      ["RegimenFiscalReceptor", c.Receptor.RegimenFiscalReceptor],
      ["UsoCFDI", c.Receptor.UsoCFDI],
    ])}/>`,
  );

  lineas.push(`  <cfdi:Conceptos>`);
  for (const con of c.Conceptos) {
    const conceptoAttrs = attrs([
      ["ClaveProdServ", con.ClaveProdServ],
      ["NoIdentificacion", con.NoIdentificacion],
      ["Cantidad", con.Cantidad],
      ["ClaveUnidad", con.ClaveUnidad],
      ["Unidad", con.Unidad],
      ["Descripcion", con.Descripcion],
      ["ValorUnitario", con.ValorUnitario],
      ["Importe", con.Importe],
      ["Descuento", con.Descuento],
      ["ObjetoImp", con.ObjetoImp],
    ]);
    const tieneImpuestos =
      (con.Traslados && con.Traslados.length > 0) ||
      (con.Retenciones && con.Retenciones.length > 0);
    if (!tieneImpuestos) {
      lineas.push(`    <cfdi:Concepto${conceptoAttrs}/>`);
      continue;
    }
    lineas.push(`    <cfdi:Concepto${conceptoAttrs}>`);
    lineas.push(`      <cfdi:Impuestos>`);
    if (con.Traslados && con.Traslados.length > 0) {
      lineas.push(`        <cfdi:Traslados>`);
      for (const t of con.Traslados) lineas.push(trasladoXml(t, "          "));
      lineas.push(`        </cfdi:Traslados>`);
    }
    if (con.Retenciones && con.Retenciones.length > 0) {
      lineas.push(`        <cfdi:Retenciones>`);
      for (const r of con.Retenciones) {
        lineas.push(
          `          <cfdi:Retencion${attrs([
            ["Base", r.Base],
            ["Impuesto", r.Impuesto],
            ["TipoFactor", r.TipoFactor],
            ["TasaOCuota", r.TasaOCuota],
            ["Importe", r.Importe],
          ])}/>`,
        );
      }
      lineas.push(`        </cfdi:Retenciones>`);
    }
    lineas.push(`      </cfdi:Impuestos>`);
    lineas.push(`    </cfdi:Concepto>`);
  }
  lineas.push(`  </cfdi:Conceptos>`);

  if (c.Impuestos) {
    const imp = c.Impuestos;
    lineas.push(
      `  <cfdi:Impuestos${attrs([
        ["TotalImpuestosRetenidos", imp.TotalImpuestosRetenidos],
        ["TotalImpuestosTrasladados", imp.TotalImpuestosTrasladados],
      ])}>`,
    );
    if (imp.Retenciones && imp.Retenciones.length > 0) {
      lineas.push(`    <cfdi:Retenciones>`);
      for (const r of imp.Retenciones) {
        lineas.push(
          `      <cfdi:Retencion${attrs([
            ["Impuesto", r.Impuesto],
            ["Importe", r.Importe],
          ])}/>`,
        );
      }
      lineas.push(`    </cfdi:Retenciones>`);
    }
    if (imp.Traslados && imp.Traslados.length > 0) {
      lineas.push(`    <cfdi:Traslados>`);
      for (const t of imp.Traslados) lineas.push(trasladoXml(t, "      "));
      lineas.push(`    </cfdi:Traslados>`);
    }
    lineas.push(`  </cfdi:Impuestos>`);
  }

  lineas.push(`</cfdi:Comprobante>`);
  return lineas.join("\n");
}

/** Inserta un complemento (p. ej. el Timbre Fiscal Digital) antes del cierre del comprobante. */
export function insertarComplemento(xml: string, complementoXml: string): string {
  const cierre = "</cfdi:Comprobante>";
  const complemento = `  <cfdi:Complemento>\n    ${complementoXml}\n  </cfdi:Complemento>\n`;
  return xml.replace(cierre, complemento + cierre);
}
