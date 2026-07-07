"use client";

import { useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";

// Filtro de periodo compartido (facturas, pagos, CxC, CxP, nómina): un select
// de periodos rápidos que llena las fechas desde/hasta, ajustables a mano.
// Por default las listas muestran el mes actual.

export const PERIODOS = [
  { clave: "mes", label: "Este mes" },
  { clave: "mes-anterior", label: "Mes anterior" },
  { clave: "3m", label: "Últimos 3 meses" },
  { clave: "anio", label: "Este año" },
  { clave: "", label: "Cualquier fecha" },
  { clave: "custom", label: "Personalizado" },
] as const;

// Fecha local AAAA-MM-DD (sin el corrimiento de día de toISOString/UTC).
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function rangoDePeriodo(clave: string): { desde: string; hasta: string } {
  const hoy = new Date();
  switch (clave) {
    case "mes":
      return { desde: isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: isoLocal(hoy) };
    case "mes-anterior":
      return {
        desde: isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        hasta: isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      };
    case "3m":
      return { desde: isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate())), hasta: isoLocal(hoy) };
    case "anio":
      return { desde: isoLocal(new Date(hoy.getFullYear(), 0, 1)), hasta: isoLocal(hoy) };
    default:
      return { desde: "", hasta: "" };
  }
}

export interface PeriodoCtrl {
  periodo: string;
  desde: string;
  hasta: string;
  aplicar: (clave: string) => void;
  cambiarDesde: (v: string) => void;
  cambiarHasta: (v: string) => void;
  /** ¿La fecha (ISO o AAAA-MM-DD) cae dentro del periodo elegido? */
  enPeriodo: (fecha: string | undefined) => boolean;
}

export function usePeriodo(inicial: string = "mes"): PeriodoCtrl {
  const [periodo, setPeriodo] = useState(inicial);
  const [rango, setRango] = useState(() => rangoDePeriodo(inicial));

  const aplicar = (clave: string) => {
    setPeriodo(clave);
    if (clave !== "custom") setRango(rangoDePeriodo(clave)); // custom conserva las fechas
  };
  const cambiarDesde = (v: string) => {
    setRango((r) => ({ ...r, desde: v }));
    setPeriodo("custom");
  };
  const cambiarHasta = (v: string) => {
    setRango((r) => ({ ...r, hasta: v }));
    setPeriodo("custom");
  };
  const enPeriodo = (fecha: string | undefined) => {
    const f = (fecha || "").slice(0, 10);
    if (rango.desde && f < rango.desde) return false;
    if (rango.hasta && f > rango.hasta) return false;
    return true;
  };

  return { periodo, desde: rango.desde, hasta: rango.hasta, aplicar, cambiarDesde, cambiarHasta, enPeriodo };
}

// Control compacto de una sola línea: [📅 Periodo ⌄ | desde → hasta]
export function FiltroPeriodo({ ctrl }: { ctrl: PeriodoCtrl }) {
  return (
    <div className="inline-flex items-center whitespace-nowrap rounded-xl border border-slate-200 bg-white pl-2.5 pr-1.5 shadow-sm transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 hover:border-brand-300">
      <CalendarRange className="size-3.5 shrink-0 text-brand-500" />
      <div className="relative">
        <select
          value={ctrl.periodo}
          onChange={(e) => ctrl.aplicar(e.target.value)}
          title="Periodo"
          className="cursor-pointer appearance-none bg-transparent py-2 pl-1.5 pr-5 text-xs font-bold text-ink-900 outline-none"
        >
          {PERIODOS.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0.5 top-1/2 size-3 -translate-y-1/2 text-ink-400" />
      </div>
      <span className="mx-1.5 h-4 w-px bg-slate-200" />
      <input
        type="date"
        value={ctrl.desde}
        onChange={(e) => ctrl.cambiarDesde(e.target.value)}
        title="Desde"
        className="tnum w-[6.9rem] cursor-pointer bg-transparent py-2 text-xs font-medium text-ink-600 outline-none"
      />
      <span className="px-1 text-[10px] text-ink-400">→</span>
      <input
        type="date"
        value={ctrl.hasta}
        onChange={(e) => ctrl.cambiarHasta(e.target.value)}
        title="Hasta"
        className="tnum w-[6.9rem] cursor-pointer bg-transparent py-2 text-xs font-medium text-ink-600 outline-none"
      />
    </div>
  );
}
