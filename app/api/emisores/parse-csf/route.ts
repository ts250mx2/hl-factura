import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { parsearConstancia } from "@/lib/sat/constancia";
import { regimenPrincipalParaFacturar } from "@/lib/contabilidad/obligaciones";

// Lee una Constancia de Situación Fiscal y devuelve los datos para pre-llenar
// el alta de una empresa (no crea nada).
export async function POST(req: Request) {
  try {
    await requireCtx(["admin", "supervisor"]);
    const form = await req.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) return fail("Sube el PDF de la Constancia de Situación Fiscal.");
    const buf = Buffer.from(await archivo.arrayBuffer());
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("El archivo no es un PDF válido.");

    let perfil;
    try {
      perfil = await parsearConstancia(buf);
    } catch {
      return fail("No se pudo leer el PDF. Verifica que sea la CSF oficial y no una imagen escaneada.");
    }

    // La razón social del CFDI va sin régimen de capital (SA DE CV, S DE RL, etc.)
    const nombre = (perfil.nombre ?? "")
      .replace(/\s*,?\s*(S\.?\s?A\.?\s?(P\.?\s?I\.?)?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?DE\s?R\.?\s?L\.?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?C\.?|S\.?\s?A\.?\s?S\.?)\.?\s*$/i, "")
      .trim();

    return ok({
      rfc: perfil.rfc ?? "",
      nombre,
      codigoPostal: perfil.codigoPostal ?? "",
      tipoPersona: perfil.tipoPersona ?? null,
      situacion: perfil.situacion ?? "",
      regimenFiscal: regimenPrincipalParaFacturar(perfil),
      regimenes: perfil.regimenes,
      obligaciones: perfil.obligaciones.length,
    });
  } catch (e) {
    return authFail(e);
  }
}
