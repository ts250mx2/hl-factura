import type { Emisor } from "../types";
import { calcularPanelFiscal } from "./fiscal";
import { estadosFinancieros } from "./estados-financieros";
import { calcularAmarre } from "./amarre";
import { obtenerCartera } from "../cxc";
import { round2 } from "../sat/importes";

// Ensambla, del lado del servidor, el reporte mensual del cliente reutilizando
// los cálculos existentes. Cada sección es de mejor esfuerzo: si una falla (p.
// ej. sin perfil fiscal), el paquete se arma con las demás. Lo usan tanto la
// descarga en PDF como el envío por correo.

export interface PaqueteMensual {
  anio: string;
  mes: string;
  fiscal: { perfilConfigurado: boolean; conceptos: { titulo: string; aCargo: number }[]; total: number } | null;
  resultados: { ingresos: number; costos: number; utilidadBruta: number; gastos: number; utilidadOperacion: number; utilidadNeta: number } | null;
  amarre: { hallazgos: string[] } | null;
  cartera: { total: number; vencida: number; facturas: number } | null;
}

export async function armarPaquete(empresa: Emisor, anio: string, mes: string): Promise<PaqueteMensual> {
  const [fiscalR, estadosR, amarreR, carteraR] = await Promise.allSettled([
    calcularPanelFiscal(empresa, anio, mes),
    estadosFinancieros(empresa.id, anio, mes),
    calcularAmarre(empresa, anio, mes),
    obtenerCartera([empresa.id]),
  ]);

  let fiscal: PaqueteMensual["fiscal"] = null;
  if (fiscalR.status === "fulfilled") {
    const conceptos = fiscalR.value.conceptos
      .filter((c) => c.periodicidad === "mensual")
      .map((c) => ({ titulo: c.titulo, aCargo: round2(c.aCargo) }));
    fiscal = {
      perfilConfigurado: fiscalR.value.perfilConfigurado,
      conceptos,
      total: round2(conceptos.filter((c) => c.aCargo > 0).reduce((s, c) => s + c.aCargo, 0)),
    };
  }

  let resultados: PaqueteMensual["resultados"] = null;
  if (estadosR.status === "fulfilled") {
    const r = estadosR.value.resultados;
    resultados = {
      ingresos: r.ingresos.total,
      costos: r.costos.total,
      utilidadBruta: r.utilidadBruta,
      gastos: r.gastos.total,
      utilidadOperacion: r.utilidadOperacion,
      utilidadNeta: r.utilidadNeta,
    };
  }

  const amarre = amarreR.status === "fulfilled" ? { hallazgos: amarreR.value.hallazgos } : null;

  let cartera: PaqueteMensual["cartera"] = null;
  if (carteraR.status === "fulfilled") {
    const b = carteraR.value.resumen.buckets;
    const vencida = round2(["vencida_30", "vencida_60", "vencida_mas"].reduce((s, k) => s + (b[k as keyof typeof b]?.total ?? 0), 0));
    cartera = { total: carteraR.value.resumen.totalCartera, vencida, facturas: carteraR.value.resumen.facturas };
  }

  return { anio, mes, fiscal, resultados, amarre, cartera };
}
