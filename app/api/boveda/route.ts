import { ok } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { listarBoveda, resumenBoveda } from "@/lib/repos";

// Bóveda de CFDI: los comprobantes descargados del SAT o importados a mano.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx();
    const url = new URL(req.url);
    const empresaId = url.searchParams.get("empresaId");
    const tipo = url.searchParams.get("tipo") ?? undefined;
    const problema = url.searchParams.get("problema") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    let empresaIds = ctx.empresas.map((e) => e.id);
    if (empresaId) {
      await requireEmpresa(ctx, empresaId);
      empresaIds = [empresaId];
    }
    const [cfdis, resumen] = await Promise.all([
      listarBoveda(empresaIds, { tipo, problema, q }),
      resumenBoveda(empresaIds),
    ]);
    return ok({ cfdis, resumen });
  } catch (e) {
    return authFail(e);
  }
}
