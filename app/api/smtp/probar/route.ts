import { ok, fail, errorMessage } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { getConfigSmtp } from "@/lib/repos";
import { probarSmtp } from "@/lib/correo";

// Verifica la conexión con el servidor SMTP configurado.
export async function POST() {
  try {
    const ctx = await requireCtx(["admin"]);
    try {
      await probarSmtp(await getConfigSmtp(ctx.despachoId));
      return ok({ conectado: true });
    } catch (e) {
      return fail(`No se pudo conectar al SMTP: ${errorMessage(e)}`);
    }
  } catch (e) {
    return authFail(e);
  }
}
