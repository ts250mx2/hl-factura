import { NextResponse } from "next/server";
import { fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail, COOKIE_EMPRESA, OPCIONES_COOKIE } from "@/lib/auth";

// Cambia la empresa (RFC) sobre la que trabaja el usuario en la interfaz.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx();
    const body = await req.json();
    const empresaId = String(body.empresaId || "");
    if (!empresaId) return fail("Indica la empresa.");
    const empresa = await requireEmpresa(ctx, empresaId);
    const res = NextResponse.json({ ok: true, data: { empresaId: empresa.id } });
    res.cookies.set(COOKIE_EMPRESA, empresa.id, OPCIONES_COOKIE);
    return res;
  } catch (e) {
    return authFail(e);
  }
}
