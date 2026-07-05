import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarReglas, guardarRegla, eliminarRegla } from "@/lib/contabilidad/repos";
import { validarRfc } from "@/lib/sat/rfc";

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    return ok(await listarReglas(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const criterio = body.criterio === "claveProdServ" ? "claveProdServ" : "rfc";
    const valor = String(body.valor || "").trim().toUpperCase();
    const cuentaCodigo = String(body.cuentaCodigo || "").trim();
    if (criterio === "rfc" && !validarRfc(valor).valido) return fail("RFC del proveedor inválido.");
    if (criterio === "claveProdServ" && !/^\d{2,8}$/.test(valor)) {
      return fail("La clave (o prefijo) debe tener entre 2 y 8 dígitos.");
    }
    if (!cuentaCodigo) return fail("Selecciona la cuenta contable destino.");
    await guardarRegla({
      empresaId: ctx.empresaActiva.id,
      criterio,
      valor,
      cuentaCodigo,
      nota: String(body.nota || "").trim() || undefined,
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
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Falta el id.");
    await eliminarRegla(ctx.empresaActiva.id, id);
    return ok({ eliminada: true });
  } catch (e) {
    return authFail(e);
  }
}
