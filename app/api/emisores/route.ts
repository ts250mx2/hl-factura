import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarEmpresas, insertarEmpresa, genId, certificadoPublico } from "@/lib/repos";
import { validarRfc, esPersonaMoral } from "@/lib/sat/rfc";
import { REGIMENES_FISCALES } from "@/lib/sat/catalogos";
import { empresasConArchivo } from "@/lib/archivos";
import { getConfigFiscal } from "@/lib/contabilidad/repos";
import type { Emisor } from "@/lib/types";

const COLORES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function sinSecretos(e: Emisor) {
  return {
    ...e,
    csd: certificadoPublico(e.csd),
    fiel: certificadoPublico(e.fiel),
  };
}

export async function GET() {
  try {
    const ctx = await requireCtx();
    const conCsf = await empresasConArchivo("csf", ctx.empresas.map((e) => e.id));
    // Última opinión 32-D de cada empresa (sentido + fecha) para el semáforo.
    const opiniones = await Promise.all(
      ctx.empresas.map(async (e) => (await getConfigFiscal(e.id)).opinion32d ?? null),
    );
    return ok(
      ctx.empresas.map((e, i) => ({
        ...sinSecretos(e),
        tieneCsf: conCsf.has(e.id),
        opinion32d: opiniones[i],
      })),
    );
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const body = await req.json();
    const rfc = String(body.rfc || "").trim().toUpperCase();
    const nombre = String(body.nombre || "").trim();
    const regimenFiscal = String(body.regimenFiscal || "");
    const codigoPostal = String(body.codigoPostal || "").trim();
    const serie = String(body.serie || "A").trim().toUpperCase();

    const errores: string[] = [];
    const rfcCheck = validarRfc(rfc);
    if (!rfcCheck.valido) errores.push(...rfcCheck.errores);
    if (rfcCheck.tipo === "generico") errores.push("No puedes usar un RFC genérico como emisor.");
    if (!nombre) errores.push("La razón social es obligatoria (sin régimen de capital, ej. sin 'SA DE CV').");
    const regimen = REGIMENES_FISCALES.find((r) => r.clave === regimenFiscal);
    if (!regimen) errores.push("Selecciona un régimen fiscal válido.");
    else if (rfcCheck.valido) {
      const moral = esPersonaMoral(rfc);
      if (moral && !regimen.moral) errores.push(`El régimen ${regimen.clave} no aplica a personas morales.`);
      if (!moral && !regimen.fisica) errores.push(`El régimen ${regimen.clave} no aplica a personas físicas.`);
    }
    if (!/^\d{5}$/.test(codigoPostal)) errores.push("El código postal (lugar de expedición) debe tener 5 dígitos.");

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
      serie: serie || "A",
      folioActual: 1,
      folioPagoActual: 1,
      colorTag: COLORES[existentes.length % COLORES.length],
      csd: null,
      fiel: null,
      creadoEl: new Date().toISOString(),
    };
    await insertarEmpresa(empresa);
    return ok(sinSecretos(empresa));
  } catch (e) {
    return authFail(e);
  }
}
