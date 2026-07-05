import { ok, fail, failMany } from "@/lib/api-helpers";
import { requireCtx, authFail } from "@/lib/auth";
import { listarEmpleados, guardarEmpleado, nuevoEmpleadoId, getEmpleado } from "@/lib/nomina/repos";
import { validarRfc } from "@/lib/sat/rfc";
import type { Empleado } from "@/lib/nomina/tipos";

function validar(body: Record<string, unknown>) {
  const errores: string[] = [];
  const rfc = String(body.rfc || "").trim().toUpperCase();
  const curp = String(body.curp || "").trim().toUpperCase();
  const nss = String(body.nss || "").trim();
  const nombre = String(body.nombre || "").trim();
  const codigoPostal = String(body.codigoPostal || "").trim();
  const salarioDiario = Number(body.salarioDiario);
  const fechaInicioLaboral = String(body.fechaInicioLaboral || "");

  if (!nombre) errores.push("El nombre del trabajador es obligatorio.");
  const rfcCheck = validarRfc(rfc);
  if (!rfcCheck.valido || rfc.length !== 13) errores.push("El RFC del trabajador debe ser de persona física (13 caracteres).");
  if (!/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp)) errores.push("La CURP no tiene un formato válido (18 caracteres).");
  if (nss && !/^\d{11}$/.test(nss)) errores.push("El NSS debe tener 11 dígitos.");
  if (!/^\d{5}$/.test(codigoPostal)) errores.push("El código postal fiscal del trabajador debe tener 5 dígitos.");
  if (!Number.isFinite(salarioDiario) || salarioDiario <= 0) errores.push("El salario diario debe ser mayor a cero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioLaboral)) errores.push("Indica la fecha de inicio de la relación laboral.");

  return {
    errores,
    datos: {
      numEmpleado: String(body.numEmpleado || "").trim() || "1",
      nombre: nombre.toUpperCase(),
      rfc,
      curp,
      nss,
      codigoPostal,
      email: String(body.email || "").trim() || undefined,
      fechaInicioLaboral,
      tipoContrato: String(body.tipoContrato || "01"),
      tipoRegimen: String(body.tipoRegimen || "02"),
      periodicidadPago: String(body.periodicidadPago || "04"),
      riesgoPuesto: String(body.riesgoPuesto || "1"),
      departamento: String(body.departamento || "").trim() || undefined,
      puesto: String(body.puesto || "").trim() || undefined,
      banco: String(body.banco || "").trim() || undefined,
      cuentaBancaria: String(body.cuentaBancaria || "").trim() || undefined,
      salarioDiario,
      activo: body.activo !== false,
    },
  };
}

export async function GET() {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    return ok(await listarEmpleados(ctx.empresaActiva.id));
  } catch (e) {
    return authFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(["admin", "supervisor", "auxiliar"]);
    if (!ctx.empresaActiva) return fail("Selecciona una empresa.");
    const body = await req.json();
    const { errores, datos } = validar(body);
    if (errores.length) return failMany(errores);

    const id = String(body.id || "");
    const existente = id ? await getEmpleado(id) : null;
    if (id && (!existente || existente.empresaId !== ctx.empresaActiva.id)) {
      return fail("Empleado no encontrado", 404);
    }
    const empleado: Empleado = {
      id: existente?.id ?? nuevoEmpleadoId(),
      empresaId: ctx.empresaActiva.id,
      ...datos,
      creadoEl: existente?.creadoEl ?? new Date().toISOString(),
    };
    await guardarEmpleado(empleado);
    return ok(empleado);
  } catch (e) {
    return authFail(e);
  }
}
