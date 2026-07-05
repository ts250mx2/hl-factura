import { validarRfc, esPersonaMoral, esRfcGenerico } from "./sat/rfc";
import { REGIMENES_FISCALES, USOS_CFDI } from "./sat/catalogos";
import type { Cliente } from "./types";

export function validarDatosCliente(body: Record<string, unknown>, existentes: Cliente[], idActual?: string) {
  const rfc = String(body.rfc || "").trim().toUpperCase();
  const nombre = String(body.nombre || "").trim();
  const regimenFiscal = String(body.regimenFiscal || "");
  const codigoPostal = String(body.codigoPostal || "").trim();
  const usoCfdi = String(body.usoCfdi || "");
  const email = String(body.email || "").trim();

  const errores: string[] = [];
  const advertencias: string[] = [];

  const rfcCheck = validarRfc(rfc);
  if (!rfcCheck.valido) errores.push(...rfcCheck.errores);
  advertencias.push(...rfcCheck.advertencias);
  if (!nombre) errores.push("El nombre / razón social es obligatorio, tal como aparece en la Constancia de Situación Fiscal.");
  if (!/^\d{5}$/.test(codigoPostal)) errores.push("El código postal del domicilio fiscal debe tener 5 dígitos.");
  if (!USOS_CFDI.some((u) => u.clave === usoCfdi) && !esRfcGenerico(rfc)) errores.push("Selecciona un uso de CFDI válido.");

  if (!esRfcGenerico(rfc)) {
    const regimen = REGIMENES_FISCALES.find((r) => r.clave === regimenFiscal);
    if (!regimen) errores.push("Selecciona el régimen fiscal del cliente.");
    else {
      const moral = esPersonaMoral(rfc);
      if (moral && !regimen.moral) errores.push(`El régimen ${regimen.clave} no aplica a personas morales.`);
      if (!moral && !regimen.fisica) errores.push(`El régimen ${regimen.clave} no aplica a personas físicas.`);
    }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push("El correo electrónico no es válido.");
  if (existentes.some((c) => c.rfc === rfc && c.nombre.toUpperCase() === nombre.toUpperCase() && c.id !== idActual)) {
    errores.push(`Ya tienes registrado a ${nombre} con el RFC ${rfc}.`);
  }

  const datos = {
    rfc,
    nombre,
    regimenFiscal: esRfcGenerico(rfc) ? "616" : regimenFiscal,
    codigoPostal,
    usoCfdi: esRfcGenerico(rfc) ? "S01" : usoCfdi,
    email: email || undefined,
  };
  return { errores, advertencias, datos };
}
