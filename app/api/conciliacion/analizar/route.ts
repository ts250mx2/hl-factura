import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { parsearEstadoDeCuenta, analizarDepositos } from "@/lib/conciliacion";

// Analiza un estado de cuenta: extrae depósitos y los empareja con la cartera PPD.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const form = await req.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) return fail("Sube el estado de cuenta (CSV o TXT).");

    const buf = Buffer.from(await archivo.arrayBuffer());
    let contenido = buf.toString("utf8");
    if (contenido.includes("�")) contenido = buf.toString("latin1"); // bancos que exportan en latin1
    if (contenido.charCodeAt(0) === 0xfeff) contenido = contenido.slice(1);

    const parseado = parsearEstadoDeCuenta(contenido);
    const analizados = await analizarDepositos(ctx.empresaActiva.id, parseado.depositos);
    return ok({
      depositos: analizados,
      totalLineas: parseado.totalLineas,
      ignorados: parseado.ignorados,
      advertencia: parseado.advertencia,
    });
  } catch (e) {
    return authFail(e);
  }
}
