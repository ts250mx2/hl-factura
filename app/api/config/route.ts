import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import {
  getConfigPac,
  guardarConfigPac,
  getConfigSync,
  guardarConfigSync,
  getConfigSmtp,
  guardarConfigSmtp,
} from "@/lib/repos";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin"]);
    const [pac, sync, smtp] = await Promise.all([
      getConfigPac(ctx.despachoId),
      getConfigSync(ctx.despachoId),
      getConfigSmtp(ctx.despachoId),
    ]);
    return ok({
      pac: {
        modo: pac.modo,
        swUrlServices: pac.swUrlServices,
        swUrlApi: pac.swUrlApi,
        swUser: pac.swUser ?? "",
        tieneToken: Boolean(pac.swToken),
        tienePassword: Boolean(pac.swPassword),
      },
      sync,
      smtp: {
        host: smtp.host,
        port: smtp.port,
        seguro: smtp.seguro,
        user: smtp.user,
        from: smtp.from,
        recordatoriosAuto: smtp.recordatoriosAuto,
        tienePassword: Boolean(smtp.pass),
      },
    });
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireCtx(["admin"]);
    const body = await req.json();

    if (body.pac) {
      const patch = body.pac as Record<string, unknown>;
      const pac = await getConfigPac(ctx.despachoId);
      if (patch.modo === "demo" || patch.modo === "sw") pac.modo = patch.modo;
      if (typeof patch.swUrlServices === "string" && patch.swUrlServices.trim()) {
        pac.swUrlServices = patch.swUrlServices.trim().replace(/\/$/, "");
      }
      if (typeof patch.swUrlApi === "string" && patch.swUrlApi.trim()) {
        pac.swUrlApi = patch.swUrlApi.trim().replace(/\/$/, "");
      }
      if (typeof patch.swUser === "string") pac.swUser = patch.swUser.trim() || undefined;
      // token/contraseña: cadena vacía = conservar el valor actual
      if (typeof patch.swToken === "string" && patch.swToken.trim()) pac.swToken = patch.swToken.trim();
      if (typeof patch.swPassword === "string" && patch.swPassword.trim()) pac.swPassword = patch.swPassword.trim();
      await guardarConfigPac(ctx.despachoId, pac);
    }

    if (body.sync) {
      const patch = body.sync as Record<string, unknown>;
      const sync = await getConfigSync(ctx.despachoId);
      if (typeof patch.activada === "boolean") sync.activada = patch.activada;
      if (typeof patch.hora === "string" && /^\d{2}:\d{2}$/.test(patch.hora)) sync.hora = patch.hora;
      if (Number.isInteger(patch.ventanaDias) && (patch.ventanaDias as number) >= 1 && (patch.ventanaDias as number) <= 30) {
        sync.ventanaDias = patch.ventanaDias as number;
      }
      if (typeof patch.emitidas === "boolean") sync.emitidas = patch.emitidas;
      if (typeof patch.recibidas === "boolean") sync.recibidas = patch.recibidas;
      if (typeof patch.metadata === "boolean") sync.metadata = patch.metadata;
      await guardarConfigSync(ctx.despachoId, sync);
    }

    if (body.smtp) {
      const patch = body.smtp as Record<string, unknown>;
      const smtp = await getConfigSmtp(ctx.despachoId);
      if (typeof patch.host === "string") smtp.host = patch.host.trim();
      if (Number.isInteger(patch.port) && (patch.port as number) > 0) smtp.port = patch.port as number;
      if (typeof patch.seguro === "boolean") smtp.seguro = patch.seguro;
      if (typeof patch.user === "string") smtp.user = patch.user.trim();
      if (typeof patch.from === "string") smtp.from = patch.from.trim();
      if (typeof patch.recordatoriosAuto === "boolean") smtp.recordatoriosAuto = patch.recordatoriosAuto;
      // contraseña: vacío = conservar
      if (typeof patch.pass === "string" && patch.pass.trim()) smtp.pass = patch.pass.trim();
      await guardarConfigSmtp(ctx.despachoId, smtp);
    }

    return ok({ guardado: true });
  } catch (e) {
    return authFail(e);
  }
}
