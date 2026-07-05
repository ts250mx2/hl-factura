import type { MetodoIsr, ObligacionFiscal, PerfilFiscal, RegimenRegistrado, TipoImpuesto } from "../types";

// Catálogo de regímenes fiscales (c_RegimenFiscal) y clasificación de las
// obligaciones que vienen en la Constancia de Situación Fiscal, para derivar
// automáticamente qué impuestos debe calcular cada contribuyente.

export interface RegimenCat {
  clave: string;
  nombre: string;
  persona: "fisica" | "moral" | "ambas";
  metodoIsr: MetodoIsr; // método de cálculo de ISR sugerido
}

export const REGIMENES_FISCALES: RegimenCat[] = [
  { clave: "601", nombre: "General de Ley Personas Morales", persona: "moral", metodoIsr: "pm_general" },
  { clave: "603", nombre: "Personas Morales con Fines no Lucrativos", persona: "moral", metodoIsr: "ninguno" },
  { clave: "605", nombre: "Sueldos y Salarios e Ingresos Asimilados a Salarios", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "606", nombre: "Arrendamiento", persona: "fisica", metodoIsr: "arrendamiento" },
  { clave: "607", nombre: "Régimen de Enajenación o Adquisición de Bienes", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "608", nombre: "Demás ingresos", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "610", nombre: "Residentes en el Extranjero sin Establecimiento Permanente en México", persona: "ambas", metodoIsr: "ninguno" },
  { clave: "611", nombre: "Ingresos por Dividendos (socios y accionistas)", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "612", nombre: "Personas Físicas con Actividades Empresariales y Profesionales", persona: "fisica", metodoIsr: "pf_actividad" },
  { clave: "614", nombre: "Ingresos por intereses", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "615", nombre: "Régimen de los ingresos por obtención de premios", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "616", nombre: "Sin obligaciones fiscales", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "620", nombre: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", persona: "moral", metodoIsr: "pm_general" },
  { clave: "621", nombre: "Incorporación Fiscal", persona: "fisica", metodoIsr: "ninguno" },
  { clave: "622", nombre: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", persona: "ambas", metodoIsr: "pf_actividad" },
  { clave: "623", nombre: "Opcional para Grupos de Sociedades", persona: "moral", metodoIsr: "pm_general" },
  { clave: "624", nombre: "Coordinados", persona: "moral", metodoIsr: "pm_general" },
  { clave: "625", nombre: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas", persona: "fisica", metodoIsr: "pf_actividad" },
  { clave: "626", nombre: "Régimen Simplificado de Confianza", persona: "ambas", metodoIsr: "resico_pf" },
];

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function regimenPorClave(clave: string): RegimenCat | undefined {
  return REGIMENES_FISCALES.find((r) => r.clave === clave);
}

/** Deduce la clave de régimen (c_RegimenFiscal) a partir de su nombre en la CSF. */
export function claveRegimenPorNombre(nombre: string): string | undefined {
  const n = normalizar(nombre);
  const exacto = REGIMENES_FISCALES.find((r) => normalizar(r.nombre) === n);
  if (exacto) return exacto.clave;
  const parcial = REGIMENES_FISCALES.find(
    (r) => n.includes(normalizar(r.nombre)) || normalizar(r.nombre).includes(n),
  );
  if (parcial) return parcial.clave;
  if (n.includes("simplificado de confianza")) return "626";
  if (n.includes("actividades empresariales y profesionales")) return "612";
  if (n.includes("plataformas tecnologicas")) return "625";
  if (n.includes("arrendamiento")) return "606";
  if (n.includes("sueldos") || n.includes("salarios")) return "605";
  if (n.includes("fines no lucrativos")) return "603";
  if (n.includes("personas morales")) return "601";
  return undefined;
}

/** Clasifica una obligación por su descripción en un tipo de impuesto. */
export function clasificarObligacion(descripcion: string): TipoImpuesto {
  const d = normalizar(descripcion);
  const esRet = d.includes("retencion") || d.includes("entero") || d.includes("efectuadas");
  // "informativa" contiene la subcadena "iva": evaluarla antes que el IVA.
  if (d.includes("diot") || d.includes("informativa")) return "informativa";
  if (/\biva\b/.test(d) || d.includes("valor agregado")) {
    return esRet ? "ret_iva" : "iva_mensual";
  }
  if (esRet && (d.includes("salario") || d.includes("sueldo") || d.includes("trabajadores") || d.includes("asimilados"))) {
    return "ret_isr_salarios";
  }
  if (esRet) return "ret_isr_servicios";
  if (d.includes("simplificado de confianza") || d.includes("resico")) {
    return d.includes("moral") ? "isr_resico_pm" : "isr_resico_pf";
  }
  if (d.includes("arrendamiento")) return "isr_arrendamiento";
  if (d.includes("anual")) return "isr_anual";
  if (d.includes("provisional") || d.includes("sobre la renta") || d.includes("isr")) {
    return d.includes("moral") || d.includes("personas morales") ? "isr_provisional_pm" : "isr_provisional_pf";
  }
  return "otro";
}

export const IMPUESTO_LABEL: Record<TipoImpuesto, string> = {
  isr_provisional_pf: "ISR provisional (persona física)",
  isr_resico_pf: "ISR RESICO (persona física)",
  isr_resico_pm: "ISR RESICO (persona moral)",
  isr_provisional_pm: "ISR provisional (persona moral)",
  isr_arrendamiento: "ISR arrendamiento",
  iva_mensual: "IVA mensual",
  ret_isr_salarios: "Retenciones de ISR por salarios",
  ret_isr_servicios: "Retenciones de ISR a terceros",
  ret_iva: "Retenciones de IVA a terceros",
  isr_anual: "Declaración anual de ISR",
  informativa: "Declaración informativa",
  otro: "Otra obligación",
};

/** Deriva el método de cálculo de ISR a partir de los regímenes del perfil. */
export function metodoIsrDesdePerfil(perfil?: PerfilFiscal): MetodoIsr {
  if (!perfil || perfil.regimenes.length === 0) return "ninguno";
  const persona = perfil.tipoPersona ?? (perfil.rfc && perfil.rfc.length === 12 ? "moral" : "fisica");
  const claves = perfil.regimenes.map((r) => r.clave);
  if (claves.includes("626")) return persona === "moral" ? "resico_pm" : "resico_pf";
  if (claves.some((c) => ["612", "622", "625"].includes(c))) return "pf_actividad";
  if (claves.includes("606")) return "arrendamiento";
  if (claves.some((c) => ["601", "620", "623", "624"].includes(c))) return "pm_general";
  return "ninguno";
}

/** Conjunto de impuestos aplicables a partir de las obligaciones registradas. */
export function impuestosDesdePerfil(perfil?: PerfilFiscal): Set<TipoImpuesto> {
  const set = new Set<TipoImpuesto>();
  for (const o of perfil?.obligaciones ?? []) {
    if (o.fechaFin) continue; // obligación ya dada de baja
    set.add(o.tipo);
  }
  return set;
}

const TIPOS_IMPUESTO: TipoImpuesto[] = [
  "isr_provisional_pf", "isr_resico_pf", "isr_resico_pm", "isr_provisional_pm",
  "isr_arrendamiento", "iva_mensual", "ret_isr_salarios", "ret_isr_servicios",
  "ret_iva", "isr_anual", "informativa", "otro",
];

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Normaliza y valida un perfil que llega de la interfaz (edición manual). */
export function sanitizarPerfil(entrada: unknown, previo?: PerfilFiscal): PerfilFiscal {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const regsRaw = Array.isArray(e.regimenes) ? (e.regimenes as Record<string, unknown>[]) : [];
  const regimenes: RegimenRegistrado[] = regsRaw
    .filter((r) => texto(r.clave))
    .map((r) => {
      const clave = String(r.clave).trim();
      return {
        clave,
        nombre: regimenPorClave(clave)?.nombre ?? texto(r.nombre) ?? clave,
        fechaInicio: texto(r.fechaInicio),
        fechaFin: texto(r.fechaFin),
      };
    });

  const oblsRaw = Array.isArray(e.obligaciones) ? (e.obligaciones as Record<string, unknown>[]) : [];
  const obligaciones: ObligacionFiscal[] = oblsRaw
    .filter((o) => texto(o.descripcion))
    .map((o) => {
      const descripcion = String(o.descripcion).trim().slice(0, 200);
      const tipo = TIPOS_IMPUESTO.includes(o.tipo as TipoImpuesto)
        ? (o.tipo as TipoImpuesto)
        : clasificarObligacion(descripcion);
      return { descripcion, tipo, fechaInicio: texto(o.fechaInicio), fechaFin: texto(o.fechaFin) };
    });

  const persona = texto(e.tipoPersona);
  return {
    rfc: texto(e.rfc)?.toUpperCase() ?? previo?.rfc,
    curp: texto(e.curp)?.toUpperCase() ?? previo?.curp,
    nombre: texto(e.nombre) ?? previo?.nombre,
    codigoPostal: texto(e.codigoPostal) ?? previo?.codigoPostal,
    tipoPersona: persona === "moral" || persona === "fisica" ? persona : previo?.tipoPersona,
    situacion: texto(e.situacion) ?? previo?.situacion,
    fechaInicioOperaciones: texto(e.fechaInicioOperaciones) ?? previo?.fechaInicioOperaciones,
    regimenes,
    obligaciones,
    csfArchivo: previo?.csfArchivo,
    importadaEl: previo?.importadaEl,
    fuente: "manual",
  };
}
