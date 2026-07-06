import fs from "fs";
import path from "path";
import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarEmpresas, insertarEmpresa, genId } from "@/lib/repos";
import { validarRfc, esPersonaMoral } from "@/lib/sat/rfc";
import { REGIMENES_FISCALES } from "@/lib/sat/catalogos";
import { parsearConstancia } from "@/lib/sat/constancia";
import { getConfigFiscal, guardarConfigFiscal } from "@/lib/contabilidad/repos";
import { CONSTANCIAS_DIR, ensureDirs } from "@/lib/db";
import type { Emisor } from "@/lib/types";

const COLORES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

// Crea una empresa a partir de la CSF: valida los datos (con lo que el usuario
// haya ajustado), la registra y le guarda el perfil fiscal (régimen y
// obligaciones) y el PDF de la constancia.
export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const form = await req.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) return fail("Sube el PDF de la Constancia de Situación Fiscal.");
    const buf = Buffer.from(await archivo.arrayBuffer());
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("El archivo no es un PDF válido.");

    let perfil;
    try {
      perfil = await parsearConstancia(buf);
    } catch {
      return fail("No se pudo leer el PDF de la CSF.");
    }

    const val = (k: string, alt = "") => String(form.get(k) ?? alt).trim();
    const rfc = (val("rfc", perfil.rfc ?? "")).toUpperCase();
    const nombre = val("nombre", perfil.nombre ?? "");
    const regimenFiscal = val("regimenFiscal");
    const codigoPostal = val("codigoPostal", perfil.codigoPostal ?? "");
    const serie = (val("serie", "A") || "A").toUpperCase();

    const errores: string[] = [];
    const rfcCheck = validarRfc(rfc);
    if (!rfcCheck.valido) errores.push(...rfcCheck.errores);
    if (rfcCheck.tipo === "generico") errores.push("No puedes usar un RFC genérico como emisor.");
    if (!nombre) errores.push("No se detectó la razón social; captúrala.");
    const regimen = REGIMENES_FISCALES.find((r) => r.clave === regimenFiscal);
    if (!regimen) errores.push("No se detectó un régimen fiscal válido; selecciónalo.");
    else if (rfcCheck.valido) {
      const moral = esPersonaMoral(rfc);
      if (moral && !regimen.moral) errores.push(`El régimen ${regimen.clave} no aplica a personas morales.`);
      if (!moral && !regimen.fisica) errores.push(`El régimen ${regimen.clave} no aplica a personas físicas.`);
    }
    if (!/^\d{5}$/.test(codigoPostal)) errores.push("No se detectó el código postal; captúralo (5 dígitos).");

    const existentes = await listarEmpresas(ctx.despachoId);
    if (existentes.some((e) => e.rfc === rfc)) errores.push(`Ya administras una empresa con el RFC ${rfc}.`);
    if (errores.length) return failMany(errores);

    const empresa: Emisor = {
      id: genId(),
      despachoId: ctx.despachoId,
      rfc,
      nombre,
      regimenFiscal,
      codigoPostal,
      serie,
      folioActual: 1,
      folioPagoActual: 1,
      colorTag: COLORES[existentes.length % COLORES.length],
      csd: null,
      fiel: null,
      creadoEl: new Date().toISOString(),
    };
    await insertarEmpresa(empresa);

    // Guarda el PDF y el perfil fiscal (régimen + obligaciones) de la nueva empresa.
    try {
      ensureDirs();
      const destino = path.join(CONSTANCIAS_DIR, `${empresa.id}.pdf`);
      fs.writeFileSync(destino, buf);
      perfil.csfArchivo = destino;
      perfil.importadaEl = new Date().toISOString();
      perfil.fuente = "csf";
      const cfg = await getConfigFiscal(empresa.id);
      await guardarConfigFiscal(empresa.id, { ...cfg, perfil });
    } catch {
      /* la empresa ya quedó creada; el perfil fiscal es complementario */
    }

    return ok({
      empresa: { ...empresa, csd: null, fiel: null },
      regimenes: perfil.regimenes.length,
      obligaciones: perfil.obligaciones.length,
    });
  } catch (e) {
    return authFail(e);
  }
}
