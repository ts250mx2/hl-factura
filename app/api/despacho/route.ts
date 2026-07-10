import { ok } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { estadoDespacho } from "@/lib/torre";

// Torre de control: estado de cumplimiento de todas las empresas visibles.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    const url = new URL(req.url);
    const hoy = new Date();
    const anio = Number(url.searchParams.get("anio")) || hoy.getFullYear();
    const mes = Number(url.searchParams.get("mes")) || hoy.getMonth() + 1;
    const periodoOk = anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12;
    return ok(
      await estadoDespacho(
        ctx.empresas,
        ctx.despachoId,
        periodoOk ? anio : hoy.getFullYear(),
        periodoOk ? mes : hoy.getMonth() + 1,
      ),
    );
  } catch (e) {
    return authFail(e);
  }
}
