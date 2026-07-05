// Validación de RFC conforme a las reglas del SAT (formato + dígito verificador)

export const RFC_GENERICO_NACIONAL = "XAXX010101000";
export const RFC_GENERICO_EXTRANJERO = "XEXX010101000";

const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{2})([0-9A])$/;

const DV_ALPHABET = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";

export function esRfcGenerico(rfc: string): boolean {
  return rfc === RFC_GENERICO_NACIONAL || rfc === RFC_GENERICO_EXTRANJERO;
}

export function esPersonaMoral(rfc: string): boolean {
  return rfc.length === 12;
}

/** Calcula el dígito verificador del RFC según el anexo del SAT. */
export function digitoVerificador(rfc: string): string | null {
  const cuerpo = rfc.slice(0, -1);
  // Se rellena a 12 posiciones con espacio a la izquierda (personas morales tienen 11 de cuerpo)
  const relleno = cuerpo.length === 11 ? " " + cuerpo : cuerpo;
  if (relleno.length !== 12) return null;
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const idx = DV_ALPHABET.indexOf(relleno[i]);
    if (idx < 0) return null;
    suma += idx * (13 - i);
  }
  const mod = suma % 11;
  if (mod === 0) return "0";
  const dv = 11 - mod;
  return dv === 10 ? "A" : String(dv);
}

export interface ResultadoRfc {
  valido: boolean;
  errores: string[];
  advertencias: string[];
  tipo: "fisica" | "moral" | "generico" | null;
}

export function validarRfc(rfcRaw: string): ResultadoRfc {
  const rfc = (rfcRaw || "").trim().toUpperCase();
  const errores: string[] = [];
  const advertencias: string[] = [];

  if (!rfc) {
    return { valido: false, errores: ["El RFC es obligatorio"], advertencias, tipo: null };
  }
  if (esRfcGenerico(rfc)) {
    return { valido: true, errores, advertencias, tipo: "generico" };
  }
  if (rfc.length !== 12 && rfc.length !== 13) {
    errores.push("El RFC debe tener 12 caracteres (moral) o 13 (física)");
  }
  const m = rfc.match(RFC_REGEX);
  if (!m) {
    errores.push("El formato del RFC no es válido (ej. GODE561231GR8 o EKU9003173C9)");
  } else {
    const mes = parseInt(m[3], 10);
    const dia = parseInt(m[4], 10);
    if (mes < 1 || mes > 12) errores.push("El mes de la fecha del RFC no es válido");
    if (dia < 1 || dia > 31) errores.push("El día de la fecha del RFC no es válido");
    const dv = digitoVerificador(rfc);
    if (dv !== null && dv !== rfc[rfc.length - 1]) {
      advertencias.push(
        `El dígito verificador no coincide (se esperaba "${dv}"). Verifica que el RFC esté bien escrito.`,
      );
    }
  }
  return {
    valido: errores.length === 0,
    errores,
    advertencias,
    tipo: rfc.length === 12 ? "moral" : "fisica",
  };
}
