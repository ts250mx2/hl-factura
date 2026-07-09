import type { Emisor, PerfilFiscal, TipoImpuesto } from "../types";
import { IMPUESTO_LABEL, impuestosDesdePerfil } from "./obligaciones";

// Calendario de obligaciones fiscales del despacho: para un mes dado, deriva qué
// declaraciones debe presentar cada empresa y con qué fecha límite, y calcula su
// estado (presentado / pendiente / por vencer / vencido). Las obligaciones salen
// del perfil de la Constancia de Situación Fiscal cuando existe; si no, se estiman
// del régimen fiscal de la empresa.

export type EstadoObligacion = "presentado" | "pendiente" | "por_vencer" | "vencido";

export interface ObligacionCalendario {
  clave: string; // estable por (empresa, mes): el tipo de impuesto
  tipo: TipoImpuesto;
  label: string;
  periodicidad: "mensual" | "anual";
  periodoTrabajado: string; // el periodo que se declara (p. ej. "2026-06" o "2025")
  vence: string; // ISO AAAA-MM-DD
  estado: EstadoObligacion;
  presentadoEl?: string;
  nota?: string;
}

export interface EmpresaCalendario {
  empresaId: string;
  rfc: string;
  nombre: string;
  colorTag: string;
  // true = las obligaciones se estimaron del régimen (sin CSF importada).
  estimado: boolean;
  obligaciones: ObligacionCalendario[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Recorre una fecha límite al siguiente día hábil si cae en sábado o domingo
 *  (art. 12 CFF). No contempla días festivos oficiales, así que puede quedar un
 *  día corto en esos casos puntuales; el fin de semana es lo que más afecta. */
function siguienteDiaHabil(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay(); // 0=domingo, 6=sábado
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Persona (física/moral) del perfil o, en su defecto, por longitud del RFC. */
function personaDe(rfc: string, perfil?: PerfilFiscal): "fisica" | "moral" {
  if (perfil?.tipoPersona) return perfil.tipoPersona;
  return rfc.length === 12 ? "moral" : "fisica";
}

/** Estimación de obligaciones a partir del régimen (c_RegimenFiscal) cuando no
 *  hay CSF importada. Es de mejor esfuerzo; la CSF siempre manda si está. */
export function obligacionesDeRegimen(regimen: string, persona: "fisica" | "moral"): Set<TipoImpuesto> {
  const s = new Set<TipoImpuesto>();
  const add = (...t: TipoImpuesto[]) => t.forEach((x) => s.add(x));
  switch (regimen) {
    case "626": // RESICO
      add(persona === "moral" ? "isr_resico_pm" : "isr_resico_pf", "iva_mensual", "isr_anual");
      break;
    case "612": // Actividad empresarial y profesional PF
    case "622": // Agrícolas/ganaderas
    case "625": // Plataformas tecnológicas
      add("isr_provisional_pf", "iva_mensual", "informativa", "isr_anual");
      break;
    case "601": // General PM
    case "620":
    case "623":
    case "624":
      add("isr_provisional_pm", "iva_mensual", "informativa", "ret_isr_salarios", "isr_anual");
      break;
    case "606": // Arrendamiento
      add("isr_arrendamiento", "iva_mensual", "isr_anual");
      break;
    case "603": // PM fines no lucrativos
      add("ret_isr_salarios", "informativa");
      break;
    // 605 (sueldos), 616 (sin obligaciones) y demás: sin declaraciones propias.
    default:
      break;
  }
  return s;
}

/** Mes inmediato anterior a (anio, mes). */
function mesAnterior(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

/** Fecha local de hoy en AAAA-MM-DD (sin corrimiento por zona horaria). */
function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00`);
  const b = new Date(`${hasta}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function estadoDe(vence: string, presentado: boolean): EstadoObligacion {
  if (presentado) return "presentado";
  const hoy = hoyIso();
  if (hoy > vence) return "vencido";
  return diasEntre(hoy, vence) <= 5 ? "por_vencer" : "pendiente";
}

/** Obligaciones a presentar por una empresa en el mes (anio, mes) del tablero.
 *  El "mes del tablero" es el del vencimiento: las mensuales del periodo M-1 se
 *  presentan el día 17 de M; la anual aparece en su mes de vencimiento. */
export function obligacionesDeEmpresa(
  empresa: Emisor,
  perfil: PerfilFiscal | undefined,
  anio: number,
  mes: number,
  presentadas: Map<string, { presentadoEl: string; nota?: string }>,
): EmpresaCalendario {
  const persona = personaDe(empresa.rfc, perfil);
  const tienePerfil = Boolean(perfil && perfil.regimenes.length > 0);
  const activos = tienePerfil ? impuestosDesdePerfil(perfil) : obligacionesDeRegimen(empresa.regimenFiscal, persona);

  const prev = mesAnterior(anio, mes);
  const obligaciones: ObligacionCalendario[] = [];

  for (const tipo of activos) {
    if (tipo === "otro") continue; // sin fecha de vencimiento fiable

    if (tipo === "isr_anual") {
      // La anual solo aparece en su mes de vencimiento: PM 31-mar, PF 30-abr.
      const mesVence = persona === "moral" ? 3 : 4;
      if (mes !== mesVence) continue;
      const dia = persona === "moral" ? 31 : 30;
      const vence = siguienteDiaHabil(`${anio}-${pad(mesVence)}-${dia}`);
      const marca = presentadas.get(tipo);
      obligaciones.push({
        clave: tipo,
        tipo,
        label: IMPUESTO_LABEL[tipo],
        periodicidad: "anual",
        periodoTrabajado: String(anio - 1),
        vence,
        estado: estadoDe(vence, Boolean(marca)),
        presentadoEl: marca?.presentadoEl,
        nota: marca?.nota,
      });
      continue;
    }

    // Mensuales: se declaran el día 17 del mes del tablero, por el mes anterior.
    const vence = siguienteDiaHabil(`${anio}-${pad(mes)}-17`);
    const marca = presentadas.get(tipo);
    obligaciones.push({
      clave: tipo,
      tipo,
      label: IMPUESTO_LABEL[tipo],
      periodicidad: "mensual",
      periodoTrabajado: `${prev.anio}-${pad(prev.mes)}`,
      vence,
      estado: estadoDe(vence, Boolean(marca)),
      presentadoEl: marca?.presentadoEl,
      nota: marca?.nota,
    });
  }

  // Orden: primero por fecha de vencimiento, luego por etiqueta.
  obligaciones.sort((a, b) => (a.vence !== b.vence ? (a.vence < b.vence ? -1 : 1) : a.label.localeCompare(b.label)));

  return {
    empresaId: empresa.id,
    rfc: empresa.rfc,
    nombre: empresa.nombre,
    colorTag: empresa.colorTag,
    estimado: !tienePerfil,
    obligaciones,
  };
}
