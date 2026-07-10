import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getDespacho, getConfigSmtp } from "@/lib/repos";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";
import { armarPaquete } from "@/lib/contabilidad/paquete";
import { generarPaquetePdf } from "@/lib/pdf/paquete-pdf";
import { enviarPaquete, smtpConfigurado } from "@/lib/correo";

export const maxDuration = 120;

// Envía por correo el reporte mensual del cliente (PDF adjunto) y guarda el
// correo de contacto para la próxima vez.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = (await req.json()) as { anio?: string; mes?: string; para?: string };
    const anio = String(body.anio || "");
    const mes = String(body.mes || "").padStart(2, "0");
    const para = String(body.para || "").trim();
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return fail("Correo del destinatario inválido.");

    const smtp = await getConfigSmtp(ctx.despachoId);
    if (!smtpConfigurado(smtp)) return fail("Configura el servidor de correo (SMTP) en Configuración antes de enviar.");

    const [data, despacho, cfg] = await Promise.all([
      armarPaquete(ctx.empresaActiva, anio, mes),
      getDespacho(ctx.despachoId),
      getConfigFiscal(ctx.empresaActiva.id),
    ]);
    const pdf = await generarPaquetePdf(data, ctx.empresaActiva, despacho?.nombre);

    await enviarPaquete(smtp, {
      para,
      empresa: ctx.empresaActiva,
      despachoNombre: despacho?.nombre,
      anio,
      mes,
      pdf,
      totalImpuestos: data.fiscal?.total ?? null,
    });

    // Recuerda el correo de contacto del cliente para la próxima.
    if (cfg.emailContacto !== para) await guardarConfigFiscal(ctx.empresaActiva.id, { ...cfg, emailContacto: para });

    return ok({ enviado: true, para });
  } catch (e) {
    return authFail(e);
  }
}
