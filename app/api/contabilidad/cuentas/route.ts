import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { sembrarCatalogo, guardarCuenta, eliminarCuenta } from "@/lib/contabilidad/repos";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    return ok(await sembrarCatalogo(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const codigo = String(body.codigo || "").trim();
    const nombre = String(body.nombre || "").trim();
    const codigoAgrupador = String(body.codigoAgrupador || "").trim();
    const naturaleza = body.naturaleza === "A" ? "A" : "D";
    if (!/^[\d.]{1,20}$/.test(codigo)) return fail("Código de cuenta inválido (ej. 601.04).");
    if (!nombre) return fail("Escribe el nombre de la cuenta.");
    if (!codigoAgrupador) return fail("Indica el código agrupador del SAT (Anexo 24).");
    await guardarCuenta({
      empresaId: ctx.empresaActiva.id,
      codigo,
      nombre,
      codigoAgrupador,
      naturaleza,
      nivel: codigo.includes(".") ? 2 : 1,
    });
    return ok({ guardada: true });
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const codigo = new URL(req.url).searchParams.get("codigo");
    if (!codigo) return fail("Falta el código.");
    await eliminarCuenta(ctx.empresaActiva.id, codigo);
    return ok({ eliminada: true });
  } catch (e) {
    return authFail(e);
  }
}
