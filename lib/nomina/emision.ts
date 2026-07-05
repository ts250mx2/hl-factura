import fs from "fs";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { CFDI_DIR, ensureDirs } from "../db";
import { getConfigPac, getConfigSmtp } from "../repos";
import type { Emisor, ConfigSmtp } from "../types";
import { parseCertificado, sellarCadena, verificarSello } from "../sat/certificados";
import { decryptSecret } from "../secret";
import { fechaCfdi } from "../sat/importes";
import { timbrar } from "../sat/timbrado";
import { mxn } from "../sat/format-server";
import { smtpConfigurado } from "../correo";
import type { Empleado, IncidenciasEmpleado, ReciboNomina } from "./tipos";
import type { PeriodoNomina } from "./calculo";
import { calcularRecibo } from "./calculo";
import { construirComprobanteNomina, cadenaOriginalNomina, xmlNominaCompleto } from "./cfdi-nomina";
import { getConfigNomina, getEmpleado, getReciboPeriodo, guardarRecibo } from "./repos";

// Timbrado masivo de nómina: calcula, sella y timbra el recibo de cada
// empleado del periodo. Un recibo ya timbrado del mismo periodo se omite.

export interface ItemCorrida {
  empleadoId: string;
  incidencias: IncidenciasEmpleado;
}

export interface ResultadoCorrida {
  timbrados: number;
  omitidos: number;
  errores: { empleado: string; error: string }[];
  recibos: ReciboNomina[];
}

export async function timbrarNomina(
  empresa: Emisor,
  periodo: PeriodoNomina,
  items: ItemCorrida[],
): Promise<ResultadoCorrida> {
  if (!empresa.csd) throw new Error("La empresa no tiene CSD para sellar los recibos.");
  const config = await getConfigNomina(empresa.id);
  const pac = await getConfigPac(empresa.despachoId);

  const cerBuffer = fs.readFileSync(empresa.csd.cerPath);
  const keyBuffer = fs.readFileSync(empresa.csd.keyPath);
  const password = decryptSecret(empresa.csd.passwordEnc);
  const cert = parseCertificado(cerBuffer);
  ensureDirs();

  const resultado: ResultadoCorrida = { timbrados: 0, omitidos: 0, errores: [], recibos: [] };

  for (const item of items) {
    const empleado = await getEmpleado(item.empleadoId);
    if (!empleado || empleado.empresaId !== empresa.id) {
      resultado.errores.push({ empleado: item.empleadoId, error: "Empleado no encontrado en esta empresa." });
      continue;
    }
    try {
      const existente = await getReciboPeriodo(empresa.id, empleado.id, periodo.inicio, periodo.fin);
      if (existente && existente.estado === "timbrada") {
        resultado.omitidos++;
        continue;
      }

      const calculo = calcularRecibo(empleado, config, periodo, item.incidencias);
      const recibo: ReciboNomina = {
        id: existente?.id ?? crypto.randomUUID(),
        empresaId: empresa.id,
        empleadoId: empleado.id,
        empleadoNombre: empleado.nombre,
        empleadoRfc: empleado.rfc,
        periodoInicio: periodo.inicio,
        periodoFin: periodo.fin,
        fechaPago: periodo.fechaPago,
        calculo,
        incidencias: item.incidencias,
        estado: "error",
        demo: false,
        creadoEl: existente?.creadoEl ?? new Date().toISOString(),
      };

      const comprobante = construirComprobanteNomina(
        empresa, empleado, recibo, fechaCfdi(), cert.certificadoBase64, cert.noCertificado,
      );
      const datos = { empresa, empleado, recibo, config };
      const cadena = cadenaOriginalNomina(comprobante, datos);
      const sello = sellarCadena(keyBuffer, password, cadena);
      if (!verificarSello(cert.certificadoBase64, cadena, sello)) {
        throw new Error("El sello del recibo no pudo verificarse contra el certificado.");
      }
      comprobante.Sello = sello;
      recibo.selloCFD = sello;
      recibo.noCertificado = cert.noCertificado;

      const xmlSellado = xmlNominaCompleto(comprobante, datos);
      const xmlPath = path.join(CFDI_DIR, `nom-${recibo.id}.xml`);

      try {
        const timbre = await timbrar(xmlSellado, pac);
        recibo.uuid = timbre.uuid;
        recibo.fechaTimbrado = timbre.fechaTimbrado;
        recibo.demo = timbre.demo;
        recibo.estado = "timbrada";
        fs.writeFileSync(xmlPath, timbre.xmlTimbrado, "utf8");
        resultado.timbrados++;
      } catch (e) {
        recibo.estado = "error";
        recibo.errorMsg = e instanceof Error ? e.message : "Error al timbrar";
        fs.writeFileSync(xmlPath, xmlSellado, "utf8");
        resultado.errores.push({ empleado: empleado.nombre, error: recibo.errorMsg });
      }
      recibo.xmlPath = xmlPath;
      await guardarRecibo(recibo);
      resultado.recibos.push(recibo);
    } catch (e) {
      resultado.errores.push({ empleado: empleado.nombre, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultado;
}

/** Envía por correo el XML del recibo a cada trabajador (requiere SMTP). */
export async function enviarRecibos(
  empresa: Emisor,
  recibos: ReciboNomina[],
): Promise<{ enviados: number; sinCorreo: number; errores: string[] }> {
  const smtp: ConfigSmtp = await getConfigSmtp(empresa.despachoId);
  if (!smtpConfigurado(smtp)) {
    throw new Error("Configura el servidor de correo (SMTP) en Configuración para enviar los recibos.");
  }
  const transporte = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.seguro,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  let enviados = 0;
  let sinCorreo = 0;
  const errores: string[] = [];

  for (const recibo of recibos) {
    if (recibo.estado !== "timbrada" || !recibo.xmlPath || !fs.existsSync(recibo.xmlPath)) continue;
    const empleado = await getEmpleado(recibo.empleadoId);
    if (!empleado?.email) {
      sinCorreo++;
      continue;
    }
    try {
      await transporte.sendMail({
        from: smtp.from,
        to: empleado.email,
        subject: `Recibo de nómina ${recibo.periodoInicio} — ${recibo.periodoFin} · ${empresa.nombre}`,
        html: `
          <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
            <h2 style="font-size:16px">Recibo de nómina</h2>
            <p style="font-size:14px">Hola <b>${empleado.nombre}</b>, adjuntamos el XML de tu recibo timbrado.</p>
            <table style="font-size:13px;border-collapse:collapse;width:100%">
              <tr><td style="padding:4px 0;color:#64748b">Periodo</td><td style="text-align:right">${recibo.periodoInicio} — ${recibo.periodoFin}</td></tr>
              <tr><td style="padding:4px 0;color:#64748b">Percepciones</td><td style="text-align:right">${mxn(recibo.calculo.totalPercepciones)}</td></tr>
              <tr><td style="padding:4px 0;color:#64748b">Deducciones</td><td style="text-align:right">−${mxn(recibo.calculo.totalDeducciones)}</td></tr>
              <tr><td style="padding:4px 0"><b>Neto depositado</b></td><td style="text-align:right;font-size:16px"><b>${mxn(recibo.calculo.neto)}</b></td></tr>
            </table>
            <p style="font-size:11px;color:#94a3b8">Folio fiscal: ${recibo.uuid ?? ""} · ${empresa.nombre} (${empresa.rfc})</p>
          </div>`,
        attachments: [{ filename: `recibo-${recibo.periodoInicio}.xml`, path: recibo.xmlPath }],
      });
      recibo.enviadoEl = new Date().toISOString();
      await guardarRecibo(recibo);
      enviados++;
    } catch (e) {
      errores.push(`${empleado.nombre}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { enviados, sinCorreo, errores };
}

/** CSV con los datos de afiliación/SBC para captura en SUA e IDSE. */
export function csvSua(empleados: Empleado[], recibos: ReciboNomina[]): string {
  const lineas = [
    "NSS,RFC,CURP,Nombre,FechaAlta,SalarioDiario,SDI,SBC,PeriodoInicio,PeriodoFin,DiasPagados,DiasIncapacidad,Faltas",
  ];
  for (const r of recibos) {
    const e = empleados.find((x) => x.id === r.empleadoId);
    if (!e) continue;
    lineas.push(
      [
        e.nss, e.rfc, e.curp, `"${e.nombre}"`, e.fechaInicioLaboral,
        e.salarioDiario.toFixed(2), r.calculo.sdi.toFixed(2), r.calculo.sbc.toFixed(2),
        r.periodoInicio, r.periodoFin, r.calculo.diasPagados,
        r.calculo.incapacidad?.dias ?? 0, r.incidencias.faltas ?? 0,
      ].join(","),
    );
  }
  return lineas.join("\r\n");
}
