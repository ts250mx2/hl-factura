import nodemailer from "nodemailer";
import type { ConfigSmtp, Emisor, Factura } from "./types";
import { mxn } from "./sat/format-server";

// Envío de correos (recordatorios de cobranza) vía SMTP configurable.

export function smtpConfigurado(cfg: ConfigSmtp): boolean {
  return Boolean(cfg.host && cfg.user && cfg.pass && cfg.from);
}

function transporte(cfg: ConfigSmtp) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.seguro,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

export async function probarSmtp(cfg: ConfigSmtp): Promise<void> {
  if (!smtpConfigurado(cfg)) throw new Error("Completa host, usuario, contraseña y remitente.");
  await transporte(cfg).verify();
}

export interface DatosRecordatorio {
  factura: Factura;
  saldo: number;
  vencimiento: string;
  diasVencida: number; // > 0 si ya venció
  empresa: Emisor;
  para: string;
}

export async function enviarRecordatorio(cfg: ConfigSmtp, datos: DatosRecordatorio): Promise<void> {
  if (!smtpConfigurado(cfg)) {
    throw new Error("Configura el servidor de correo (SMTP) en Configuración antes de enviar recordatorios.");
  }
  const { factura: f, saldo, vencimiento, diasVencida, empresa } = datos;
  const vencida = diasVencida > 0;
  const asunto = vencida
    ? `Recordatorio de pago vencido · Factura ${f.serie}-${f.folio} de ${empresa.nombre}`
    : `Próximo vencimiento · Factura ${f.serie}-${f.folio} de ${empresa.nombre}`;

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:12px 12px 0 0;padding:24px;color:#fff">
      <h2 style="margin:0;font-size:18px">${empresa.nombre}</h2>
      <p style="margin:4px 0 0;font-size:12px;opacity:.85">Recordatorio de cobranza</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:14px">Estimado(a) <b>${f.receptorNombre}</b>:</p>
      <p style="font-size:14px;line-height:1.6">
        ${vencida
          ? `La factura <b>${f.serie}-${f.folio}</b> venció hace <b>${diasVencida} día(s)</b> (fecha límite: ${vencimiento}).`
          : `La factura <b>${f.serie}-${f.folio}</b> está próxima a vencer (fecha límite: <b>${vencimiento}</b>).`}
      </p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#64748b">Folio fiscal</td><td style="text-align:right;font-family:monospace;font-size:11px">${f.uuid ?? ""}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Total de la factura</td><td style="text-align:right">${mxn(f.total)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b"><b>Saldo pendiente</b></td><td style="text-align:right;font-size:16px"><b>${mxn(saldo)}</b></td></tr>
      </table>
      <p style="font-size:13px;line-height:1.6;color:#475569">
        Al realizar su pago le emitiremos el complemento de recepción de pagos (REP) correspondiente.
        Si ya realizó el pago, por favor ignore este mensaje o compártanos su comprobante.
      </p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">
        ${empresa.nombre} · RFC ${empresa.rfc}
      </p>
    </div>
  </div>`;

  await transporte(cfg).sendMail({
    from: cfg.from,
    to: datos.para,
    subject: asunto,
    html,
  });
}
