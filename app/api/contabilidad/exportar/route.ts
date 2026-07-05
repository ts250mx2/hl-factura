import { fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarCuentas } from "@/lib/contabilidad/repos";
import { calcularBalanza } from "@/lib/contabilidad/balanza";
import { xmlCatalogoCuentas, xmlBalanzaComprobacion } from "@/lib/contabilidad/anexo24";

// Exporta los XML de contabilidad electrónica (Anexo 24) de la empresa activa.
export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo");
    const anio = String(url.searchParams.get("anio") || "");
    const mes = String(url.searchParams.get("mes") || "").padStart(2, "0");
    if (!/^\d{4}$/.test(anio) || !/^(0[1-9]|1[0-2])$/.test(mes)) return fail("Periodo inválido.");

    const empresa = ctx.empresaActiva;
    let xml: string;
    let sufijo: string;
    if (tipo === "catalogo") {
      xml = xmlCatalogoCuentas(empresa.rfc, anio, mes, await listarCuentas(empresa.id));
      sufijo = "CT";
    } else if (tipo === "balanza") {
      xml = xmlBalanzaComprobacion(empresa.rfc, anio, mes, await calcularBalanza(empresa.id, anio, mes));
      sufijo = "BN";
    } else {
      return fail("Tipo inválido: catalogo o balanza.");
    }
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${empresa.rfc}${anio}${mes}${sufijo}.xml"`,
      },
    });
  } catch (e) {
    return authFail(e);
  }
}
