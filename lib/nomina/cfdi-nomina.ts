import type { Emisor } from "../types";
import type { ComprobanteCfdi } from "../sat/cfdi";
import { buildCfdiXml, insertarComplemento, escapeXml } from "../sat/cfdi";
import { partesComprobante, nuevoAcumulador } from "../sat/cadena-original";
import { fmtImporte } from "../sat/importes";
import type { ConfigNomina, Empleado, ReciboNomina } from "./tipos";

// CFDI de Nómina: comprobante tipo "N" + complemento nomina12 (v1.2),
// con su cadena original según el XSLT oficial del complemento.

function antiguedadSemanas(fechaInicio: string, fechaFin: string): string {
  const semanas = Math.max(
    1,
    Math.floor((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86_400_000 / 7),
  );
  return `P${semanas}W`;
}

export function construirComprobanteNomina(
  empresa: Emisor,
  empleado: Empleado,
  recibo: ReciboNomina,
  fecha: string,
  certificadoBase64: string,
  noCertificado: string,
): ComprobanteCfdi {
  const c = recibo.calculo;
  const subTotal = fmtImporte(c.totalPercepciones + c.totalOtrosPagos);
  return {
    Version: "4.0",
    Serie: "N",
    Folio: recibo.id.slice(0, 8).toUpperCase(),
    Fecha: fecha,
    FormaPago: "99",
    NoCertificado: noCertificado,
    Certificado: certificadoBase64,
    SubTotal: subTotal,
    Descuento: c.totalDeducciones > 0 ? fmtImporte(c.totalDeducciones) : undefined,
    Moneda: "MXN",
    Total: fmtImporte(c.neto),
    TipoDeComprobante: "N",
    Exportacion: "01",
    MetodoPago: "PUE",
    LugarExpedicion: empresa.codigoPostal,
    Emisor: {
      Rfc: empresa.rfc,
      Nombre: empresa.nombre.replace(/\s+/g, " ").trim().toUpperCase(),
      RegimenFiscal: empresa.regimenFiscal,
    },
    Receptor: {
      Rfc: empleado.rfc,
      Nombre: empleado.nombre.replace(/\s+/g, " ").trim().toUpperCase(),
      DomicilioFiscalReceptor: empleado.codigoPostal,
      RegimenFiscalReceptor: "605",
      UsoCFDI: "CN01",
    },
    Conceptos: [
      {
        ClaveProdServ: "84111505",
        Cantidad: "1",
        ClaveUnidad: "ACT",
        Descripcion: "Pago de nómina",
        ValorUnitario: subTotal,
        Importe: subTotal,
        Descuento: c.totalDeducciones > 0 ? fmtImporte(c.totalDeducciones) : undefined,
        ObjetoImp: "01",
      },
    ],
  };
}

interface DatosNomina {
  empresa: Emisor;
  empleado: Empleado;
  recibo: ReciboNomina;
  config: ConfigNomina;
}

function totales(recibo: ReciboNomina) {
  const c = recibo.calculo;
  const otrasDeducciones = c.deducciones.filter((d) => d.tipo !== "002").reduce((s, d) => s + d.gravado, 0);
  const isr = c.deducciones.filter((d) => d.tipo === "002").reduce((s, d) => s + d.gravado, 0);
  return {
    totalPercepciones: c.totalPercepciones,
    totalDeducciones: c.totalDeducciones,
    totalOtrosPagos: c.totalOtrosPagos,
    totalSueldos: c.totalPercepciones,
    totalGravado: c.totalGravado,
    totalExento: c.totalExento,
    otrasDeducciones,
    isr,
    subsidioCausado: c.isr.subsidio,
  };
}

/** XML del complemento nomina12:Nomina. */
export function xmlNomina(d: DatosNomina): string {
  const { empresa, empleado, recibo, config } = d;
  const c = recibo.calculo;
  const t = totales(recibo);
  const attrs = (pares: [string, string | undefined][]) =>
    pares
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => ` ${k}="${escapeXml(v as string)}"`)
      .join("");

  const lineas: string[] = [];
  lineas.push(
    `<nomina12:Nomina xmlns:nomina12="http://www.sat.gob.mx/nomina12"${attrs([
      ["Version", "1.2"],
      ["TipoNomina", "O"],
      ["FechaPago", recibo.fechaPago],
      ["FechaInicialPago", recibo.periodoInicio],
      ["FechaFinalPago", recibo.periodoFin],
      ["NumDiasPagados", String(c.diasPagados)],
      ["TotalPercepciones", fmtImporte(t.totalPercepciones)],
      ["TotalDeducciones", t.totalDeducciones > 0 ? fmtImporte(t.totalDeducciones) : undefined],
      ["TotalOtrosPagos", fmtImporte(t.totalOtrosPagos)],
    ])}>`,
  );

  lineas.push(
    `      <nomina12:Emisor${attrs([["RegistroPatronal", config.registroPatronal || undefined]])}/>`,
  );

  lineas.push(
    `      <nomina12:Receptor${attrs([
      ["Curp", empleado.curp],
      ["NumSeguridadSocial", empleado.nss || undefined],
      ["FechaInicioRelLaboral", empleado.fechaInicioLaboral],
      ["Antigüedad", antiguedadSemanas(empleado.fechaInicioLaboral, recibo.periodoFin)],
      ["TipoContrato", empleado.tipoContrato],
      ["TipoRegimen", empleado.tipoRegimen],
      ["NumEmpleado", empleado.numEmpleado],
      ["Departamento", empleado.departamento || undefined],
      ["Puesto", empleado.puesto || undefined],
      ["RiesgoPuesto", empleado.riesgoPuesto || undefined],
      ["PeriodicidadPago", empleado.periodicidadPago],
      ["Banco", empleado.banco || undefined],
      ["CuentaBancaria", empleado.cuentaBancaria || undefined],
      ["SalarioBaseCotApor", fmtImporte(c.sbc)],
      ["SalarioDiarioIntegrado", fmtImporte(c.sdi)],
      ["ClaveEntFed", config.claveEntFed],
    ])}/>`,
  );

  // Percepciones
  lineas.push(
    `      <nomina12:Percepciones${attrs([
      ["TotalSueldos", fmtImporte(t.totalSueldos)],
      ["TotalGravado", fmtImporte(t.totalGravado)],
      ["TotalExento", fmtImporte(t.totalExento)],
    ])}>`,
  );
  for (const p of c.percepciones) {
    const percAttrs = attrs([
      ["TipoPercepcion", p.tipo],
      ["Clave", p.clave],
      ["Concepto", p.concepto],
      ["ImporteGravado", fmtImporte(p.gravado)],
      ["ImporteExento", fmtImporte(p.exento)],
    ]);
    if (p.tipo === "019" && c.horasExtra) {
      lineas.push(`        <nomina12:Percepcion${percAttrs}>`);
      lineas.push(
        `          <nomina12:HorasExtra${attrs([
          ["Dias", String(c.horasExtra.dias)],
          ["TipoHoras", "01"],
          ["HorasExtra", String(Math.round(c.horasExtra.horas))],
          ["ImportePagado", fmtImporte(c.horasExtra.importe)],
        ])}/>`,
      );
      lineas.push(`        </nomina12:Percepcion>`);
    } else {
      lineas.push(`        <nomina12:Percepcion${percAttrs}/>`);
    }
  }
  lineas.push(`      </nomina12:Percepciones>`);

  // Deducciones
  if (c.deducciones.length > 0) {
    lineas.push(
      `      <nomina12:Deducciones${attrs([
        ["TotalOtrasDeducciones", t.otrasDeducciones > 0 ? fmtImporte(t.otrasDeducciones) : undefined],
        ["TotalImpuestosRetenidos", t.isr > 0 ? fmtImporte(t.isr) : undefined],
      ])}>`,
    );
    for (const ded of c.deducciones) {
      lineas.push(
        `        <nomina12:Deduccion${attrs([
          ["TipoDeduccion", ded.tipo],
          ["Clave", ded.clave],
          ["Concepto", ded.concepto],
          ["Importe", fmtImporte(ded.gravado)],
        ])}/>`,
      );
    }
    lineas.push(`      </nomina12:Deducciones>`);
  }

  // Otros pagos (subsidio para el empleo causado)
  if (c.otrosPagos.length > 0) {
    lineas.push(`      <nomina12:OtrosPagos>`);
    for (const op of c.otrosPagos) {
      lineas.push(
        `        <nomina12:OtroPago${attrs([
          ["TipoOtroPago", op.tipo],
          ["Clave", op.clave],
          ["Concepto", op.concepto],
          ["Importe", fmtImporte(op.gravado)],
        ])}>`,
      );
      if (op.tipo === "002") {
        lineas.push(
          `          <nomina12:SubsidioAlEmpleo${attrs([["SubsidioCausado", fmtImporte(t.subsidioCausado)]])}/>`,
        );
      }
      lineas.push(`        </nomina12:OtroPago>`);
    }
    lineas.push(`      </nomina12:OtrosPagos>`);
  }

  // Incapacidades
  if (c.incapacidad) {
    lineas.push(`      <nomina12:Incapacidades>`);
    lineas.push(
      `        <nomina12:Incapacidad${attrs([
        ["DiasIncapacidad", String(c.incapacidad.dias)],
        ["TipoIncapacidad", c.incapacidad.tipo],
      ])}/>`,
    );
    lineas.push(`      </nomina12:Incapacidades>`);
  }

  lineas.push(`    </nomina12:Nomina>`);
  return lineas.join("\n");
}

/** Partes de la cadena original del complemento (secuencia del XSLT nomina12). */
export function partesNomina(d: DatosNomina): string[] {
  const { empleado, recibo, config } = d;
  const c = recibo.calculo;
  const t = totales(recibo);
  const { partes, req, opc } = nuevoAcumulador();

  // Nomina
  req("1.2");
  req("O");
  req(recibo.fechaPago);
  req(recibo.periodoInicio);
  req(recibo.periodoFin);
  req(String(c.diasPagados));
  opc(fmtImporte(t.totalPercepciones));
  opc(t.totalDeducciones > 0 ? fmtImporte(t.totalDeducciones) : undefined);
  opc(fmtImporte(t.totalOtrosPagos));

  // Emisor
  opc(config.registroPatronal || undefined);

  // Receptor
  req(empleado.curp);
  opc(empleado.nss || undefined);
  opc(empleado.fechaInicioLaboral);
  opc(antiguedadSemanas(empleado.fechaInicioLaboral, recibo.periodoFin));
  req(empleado.tipoContrato);
  req(empleado.tipoRegimen);
  req(empleado.numEmpleado);
  opc(empleado.departamento || undefined);
  opc(empleado.puesto || undefined);
  opc(empleado.riesgoPuesto || undefined);
  req(empleado.periodicidadPago);
  opc(empleado.banco || undefined);
  opc(empleado.cuentaBancaria || undefined);
  opc(fmtImporte(c.sbc));
  opc(fmtImporte(c.sdi));
  req(config.claveEntFed);

  // Percepciones
  opc(fmtImporte(t.totalSueldos));
  req(fmtImporte(t.totalGravado));
  req(fmtImporte(t.totalExento));
  for (const p of c.percepciones) {
    req(p.tipo);
    req(p.clave);
    req(p.concepto);
    req(fmtImporte(p.gravado));
    req(fmtImporte(p.exento));
    if (p.tipo === "019" && c.horasExtra) {
      req(String(c.horasExtra.dias));
      req("01");
      req(String(Math.round(c.horasExtra.horas)));
      req(fmtImporte(c.horasExtra.importe));
    }
  }

  // Deducciones
  if (c.deducciones.length > 0) {
    opc(t.otrasDeducciones > 0 ? fmtImporte(t.otrasDeducciones) : undefined);
    opc(t.isr > 0 ? fmtImporte(t.isr) : undefined);
    for (const ded of c.deducciones) {
      req(ded.tipo);
      req(ded.clave);
      req(ded.concepto);
      req(fmtImporte(ded.gravado));
    }
  }

  // Otros pagos
  for (const op of c.otrosPagos) {
    req(op.tipo);
    req(op.clave);
    req(op.concepto);
    req(fmtImporte(op.gravado));
    if (op.tipo === "002") req(fmtImporte(t.subsidioCausado));
  }

  // Incapacidades
  if (c.incapacidad) {
    req(String(c.incapacidad.dias));
    req(c.incapacidad.tipo);
  }

  return partes;
}

export function cadenaOriginalNomina(comprobante: ComprobanteCfdi, d: DatosNomina): string {
  return `||${[...partesComprobante(comprobante), ...partesNomina(d)].join("|")}||`;
}

export function xmlNominaCompleto(comprobante: ComprobanteCfdi, d: DatosNomina): string {
  let xml = buildCfdiXml(comprobante);
  xml = xml.replace(
    `xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"`,
    `xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd"`,
  );
  return insertarComplemento(xml, xmlNomina(d));
}
