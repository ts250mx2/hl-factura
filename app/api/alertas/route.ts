import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarAlertas, contarAlertasNoLeidas, marcarAlertasLeidas } from "@/lib/repos";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx();
    const url = new URL(req.url);
    const soloNoLeidas = url.searchParams.get("noLeidas") === "1";
    const empresaIds = ctx.empresas.map((e) => e.id);
    const [alertas, noLeidas] = await Promise.all([
      listarAlertas(ctx.despachoId, empresaIds, { soloNoLeidas }),
      contarAlertasNoLeidas(ctx.despachoId, empresaIds),
    ]);
    return ok({ alertas, noLeidas });
  } catch (e) {
    return authFail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    if (body.todas === true) {
      await marcarAlertasLeidas(ctx.despachoId, "todas");
    } else if (Array.isArray(body.ids) && body.ids.length) {
      await marcarAlertasLeidas(ctx.despachoId, body.ids.map(String));
    } else {
      return fail("Indica ids o todas: true.");
    }
    return ok({ hecho: true });
  } catch (e) {
    return authFail(e);
  }
}
