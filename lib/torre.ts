import type { Emisor, OpinionCumplimiento, CertificadoInfo } from "./types";
import { obtenerCartera } from "./cxc";
import { getConfigFiscal, obligacionesPresentadas } from "./contabilidad/repos";
import { obligacionesDeEmpresa } from "./contabilidad/calendario";
import { alertasNoLeidasPorEmpresa } from "./repos";
import { round2 } from "./sat/importes";

// Torre de control del despacho: el estado de cumplimiento de TODAS las empresas
// en una sola vista, sintetizando lo que ya calcula el sistema — vigencia de
// certificados, opinión 32-D, obligaciones del mes, alertas y cartera vencida —
// con un semáforo por empresa para saber de un vistazo cuáles requieren atención.

export type Severidad = "ok" | "aviso" | "critica";

export interface CertEstado {
  presente: boolean;
  dias: number | null; // días para vencer (negativo = vencido)
  vence: string | null;
}

export interface EstadoEmpresa {
  empresaId: string;
  rfc: string;
  nombre: string;
  colorTag: string;
  csd: CertEstado;
  fiel: CertEstado;
  opinion: OpinionCumplimiento | null;
  obligaciones: { vencidas: number; pendientes: number; presentadas: number };
  alertas: number;
  carteraVencida: number;
  carteraVencidaCount: number;
  severidad: Severidad;
  problemas: string[];
}

export interface ResumenDespacho {
  empresas: number;
  criticas: number;
  avisos: number;
  ok: number;
  obligacionesVencidas: number;
  carteraVencida: number;
  alertas: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

function certEstado(cert: CertificadoInfo | null | undefined): CertEstado {
  if (!cert || !cert.validoHasta) return { presente: false, dias: null, vence: null };
  // Contra el instante actual (no medianoche) y con floor: un certificado ya
  // vencido da días negativos → crítica, no "vence en 0 días" (aviso).
  const dias = Math.floor((new Date(cert.validoHasta).getTime() - Date.now()) / 86_400_000);
  return { presente: true, dias, vence: cert.validoHasta.slice(0, 10) };
}

/** ¿Hace cuántos días se descargó la opinión? (para marcarla como "vieja"). */
function diasDesde(iso: string, hoy: Date): number {
  return Math.round((hoy.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export async function estadoDespacho(
  empresas: Emisor[],
  despachoId: string,
  anio: number,
  mes: number,
): Promise<{ empresas: EstadoEmpresa[]; resumen: ResumenDespacho }> {
  const ids = empresas.map((e) => e.id);
  const periodo = `${anio}-${pad(mes)}`;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // getConfigFiscal en paralelo (no en serie por empresa); cartera con un tope
  // generoso escalado al número de empresas para no truncar el agregado.
  const [cartera, presentadas, alertasMap, configs] = await Promise.all([
    obtenerCartera(ids, { limite: Math.min(ids.length * 1000, 20_000) }),
    obligacionesPresentadas(ids, periodo),
    alertasNoLeidasPorEmpresa(despachoId, ids),
    Promise.all(empresas.map((e) => getConfigFiscal(e.id))),
  ]);
  const configPorEmpresa = new Map(empresas.map((e, i) => [e.id, configs[i]]));

  // Cartera vencida agrupada por empresa (solo lo ya vencido).
  const carteraPorEmpresa = new Map<string, { total: number; count: number }>();
  for (const it of cartera.items) {
    if (it.diasParaVencer >= 0) continue;
    const g = carteraPorEmpresa.get(it.factura.emisorId) ?? { total: 0, count: 0 };
    g.total = round2(g.total + it.saldo);
    g.count++;
    carteraPorEmpresa.set(it.factura.emisorId, g);
  }

  const salida: EstadoEmpresa[] = [];
  for (const e of empresas) {
    const cfg = configPorEmpresa.get(e.id)!;

    // Obligaciones del mes de esta empresa.
    const marcas = new Map<string, { presentadoEl: string; nota?: string }>();
    for (const [k, v] of presentadas) if (k.startsWith(`${e.id}|`)) marcas.set(k.slice(e.id.length + 1), v);
    const cal = obligacionesDeEmpresa(e, cfg.perfil, anio, mes, marcas);
    const obligaciones = { vencidas: 0, pendientes: 0, presentadas: 0 };
    for (const o of cal.obligaciones) {
      if (o.estado === "vencido") obligaciones.vencidas++;
      else if (o.estado === "presentado") obligaciones.presentadas++;
      else obligaciones.pendientes++; // pendiente + por_vencer
    }

    const csd = certEstado(e.csd);
    const fiel = certEstado(e.fiel);
    const opinion = cfg.opinion32d ?? null;
    const alertas = alertasMap.get(e.id) ?? 0;
    const car = carteraPorEmpresa.get(e.id) ?? { total: 0, count: 0 };

    // Semáforo: la peor señal manda.
    const problemas: string[] = [];
    let severidad: Severidad = "ok";
    const subir = (s: Severidad) => {
      if (s === "critica" || (s === "aviso" && severidad === "ok")) severidad = s;
    };

    if (!csd.presente) { problemas.push("Sin CSD (no puede timbrar)"); subir("aviso"); }
    else if (csd.dias !== null && csd.dias < 0) { problemas.push("CSD vencido"); subir("critica"); }
    else if (csd.dias !== null && csd.dias < 30) { problemas.push(`CSD vence en ${csd.dias} día(s)`); subir("aviso"); }

    if (fiel.presente && fiel.dias !== null && fiel.dias < 0) { problemas.push("FIEL vencida"); subir("critica"); }
    else if (fiel.presente && fiel.dias !== null && fiel.dias < 30) { problemas.push(`FIEL vence en ${fiel.dias} día(s)`); subir("aviso"); }

    if (opinion?.sentido === "negativa") { problemas.push("Opinión 32-D negativa"); subir("critica"); }
    else if (!opinion) { problemas.push("Sin opinión 32-D descargada"); subir("aviso"); }
    else if (diasDesde(opinion.fecha, hoy) > 60) { problemas.push("Opinión 32-D con más de 60 días"); subir("aviso"); }

    if (obligaciones.vencidas > 0) { problemas.push(`${obligaciones.vencidas} obligación(es) vencida(s)`); subir("critica"); }
    else if (obligaciones.pendientes > 0) { problemas.push(`${obligaciones.pendientes} obligación(es) por presentar`); subir("aviso"); }

    if (alertas > 0) { problemas.push(`${alertas} alerta(s) sin leer`); subir("aviso"); }
    if (car.count > 0) { problemas.push(`${car.count} factura(s) vencida(s) por cobrar`); subir("aviso"); }

    salida.push({
      empresaId: e.id,
      rfc: e.rfc,
      nombre: e.nombre,
      colorTag: e.colorTag,
      csd,
      fiel,
      opinion,
      obligaciones,
      alertas,
      carteraVencida: car.total,
      carteraVencidaCount: car.count,
      severidad,
      problemas,
    });
  }

  // Las críticas primero, luego avisos, luego ok.
  const orden: Record<Severidad, number> = { critica: 0, aviso: 1, ok: 2 };
  salida.sort((a, b) => orden[a.severidad] - orden[b.severidad] || a.nombre.localeCompare(b.nombre));

  const resumen: ResumenDespacho = {
    empresas: salida.length,
    criticas: salida.filter((e) => e.severidad === "critica").length,
    avisos: salida.filter((e) => e.severidad === "aviso").length,
    ok: salida.filter((e) => e.severidad === "ok").length,
    obligacionesVencidas: salida.reduce((s, e) => s + e.obligaciones.vencidas, 0),
    carteraVencida: round2(salida.reduce((s, e) => s + e.carteraVencida, 0)),
    alertas: salida.reduce((s, e) => s + e.alertas, 0),
  };

  return { empresas: salida, resumen };
}
