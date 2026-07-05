import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { calcularDiot, generarTxtDiot, generarCsvDiot } from "@/lib/contabilidad/diot";

// DIOT del periodo. Sin `formato` devuelve JSON; con `formato=txt|csv` descarga.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    const formato = url.searchParams.get("formato");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");

    const diot = await calcularDiot(ctx.empresaActiva.id, anio, mes);
    const nombre = `DIOT-${ctx.empresaActiva.rfc}-${anio}${mes}`;

    if (formato === "txt") {
      return new Response(generarTxtDiot(diot), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombre}.txt"`,
        },
      });
    }
    if (formato === "csv") {
      return new Response("﻿" + generarCsvDiot(diot), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombre}.csv"`,
        },
      });
    }
    return ok(diot);
  } catch (e) {
    return authFail(e);
  }
}
