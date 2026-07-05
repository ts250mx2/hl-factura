import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarEmpleados, listarRecibos } from "@/lib/nomina/repos";
import { csvSua } from "@/lib/nomina/emision";

// Exporta CSV con NSS/SDI/SBC/incidencias para captura en SUA e IDSE.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const inicio = url.searchParams.get("periodoInicio") ?? "";
    const [empleados, todos] = await Promise.all([
      listarEmpleados(ctx.empresaActiva.id),
      listarRecibos(ctx.empresaActiva.id, 500),
    ]);
    const recibos = todos.filter((r) => r.estado === "timbrada" && (!inicio || r.periodoInicio === inicio));
    const csv = "﻿" + csvSua(empleados, recibos);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sua_idse_${ctx.empresaActiva.rfc}${inicio ? "_" + inicio : ""}.csv"`,
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
