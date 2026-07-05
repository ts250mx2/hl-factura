import fs from "fs";
import path from "path";
import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { CONSTANCIAS_DIR, ensureDirs } from "@/lib/db";
import { parsearConstancia } from "@/lib/sat/constancia";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";

// Importa la Constancia de Situación Fiscal (PDF del SAT): extrae régimen y
// obligaciones, guarda el PDF y actualiza el perfil fiscal de la empresa.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
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

    ensureDirs();
    const destino = path.join(CONSTANCIAS_DIR, `${ctx.empresaActiva.id}.pdf`);
    fs.writeFileSync(destino, buf);

    const cfg = await getConfigFiscal(ctx.empresaActiva.id);
    perfil.csfArchivo = destino;
    perfil.importadaEl = new Date().toISOString();
    perfil.fuente = "csf";
    await guardarConfigFiscal(ctx.empresaActiva.id, { ...cfg, perfil });

    const avisos: string[] = [];
    if (perfil.regimenes.length === 0) avisos.push("No se detectaron regímenes; agrégalos manualmente.");
    if (perfil.obligaciones.length === 0) avisos.push("No se detectaron obligaciones; agrégalas manualmente.");
    return ok({ perfil, aviso: avisos.join(" ") || undefined });
  } catch (e) {
    return authFail(e);
  }
}
