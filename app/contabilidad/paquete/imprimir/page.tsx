"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, mxn } from "@/lib/client";
import { Button, Spinner } from "@/components/ui";
import { useSesion } from "@/components/session-provider";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface ConceptoImpuesto { tipo: string; titulo: string; periodicidad: string; aCargo: number; nota?: string }
interface PanelFiscal { perfilConfigurado: boolean; conceptos: ConceptoImpuesto[] }
interface FiscalResp { panel: PanelFiscal }

interface EstadosFinancieros {
  resultados: {
    ingresos: { total: number };
    costos: { total: number };
    utilidadBruta: number;
    gastos: { total: number };
    utilidadOperacion: number;
    utilidadNeta: number;
  };
}

interface Amarre {
  gastos: { noDeducibles: { count: number; total: number } };
  hallazgos: string[];
}

interface Cartera { resumen: { totalCartera: number; facturas: number; buckets: Record<string, { total: number; cantidad: number }> } }

function money(n: number) { return mxn.format(n); }

export default function PaqueteImprimirPage() {
  const { sesion } = useSesion();
  const [periodo, setPeriodo] = useState<{ anio: string; mes: string } | null>(null);
  const [fiscal, setFiscal] = useState<FiscalResp | null>(null);
  const [estados, setEstados] = useState<EstadosFinancieros | null>(null);
  const [amarre, setAmarre] = useState<Amarre | null>(null);
  const [cartera, setCartera] = useState<Cartera | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const anio = q.get("anio") || String(new Date().getFullYear());
    const mes = (q.get("mes") || "01").padStart(2, "0");
    setPeriodo({ anio, mes });
    const p = `anio=${anio}&mes=${mes}`;
    // Cada sección es best-effort: si una falla (p. ej. sin perfil), el paquete
    // se arma con las demás.
    Promise.allSettled([
      api<FiscalResp>(`/api/contabilidad/fiscal?${p}`),
      api<EstadosFinancieros>(`/api/contabilidad/estados?${p}`),
      api<Amarre>(`/api/contabilidad/amarre?${p}`),
      api<Cartera>(`/api/cxc`),
    ]).then(([f, e, a, c]) => {
      if (f.status === "fulfilled") setFiscal(f.value);
      if (e.status === "fulfilled") setEstados(e.value);
      if (a.status === "fulfilled") setAmarre(a.value);
      if (c.status === "fulfilled") setCartera(c.value);
      setListo(true);
    });
  }, []);

  useEffect(() => {
    if (listo) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [listo]);

  if (!periodo || !listo) return <Spinner label="Armando el paquete mensual…" />;

  const empresa = sesion?.empresas.find((e) => e.id === sesion.empresaActivaId);
  const conceptos = (fiscal?.panel.conceptos ?? []).filter((c) => c.periodicidad === "mensual");
  const totalImpuestos = conceptos.filter((c) => c.aCargo > 0).reduce((s, c) => s + c.aCargo, 0);
  const r = estados?.resultados;
  const carteraVencida = cartera
    ? ["vencida_30", "vencida_60", "vencida_mas"].reduce((s, k) => s + (cartera.resumen.buckets[k]?.total ?? 0), 0)
    : 0;
  const sinHallazgos = amarre && amarre.hallazgos.length === 1 && amarre.hallazgos[0].startsWith("Sin discrepancias");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/contabilidad">
          <Button variant="ghost"><ArrowLeft className="size-4" /> Volver</Button>
        </Link>
        <Button onClick={() => window.print()}><Printer className="size-4" /> Imprimir / Guardar PDF</Button>
      </div>

      <div className="print-page card space-y-6 bg-white p-8 text-[12px] leading-relaxed text-slate-800">
        {/* Portada */}
        <div className="border-b-2 border-slate-800 pb-3 text-center">
          <p className="text-lg font-black tracking-tight">{empresa?.nombre ?? "Empresa"}</p>
          <p className="font-mono text-xs">{empresa?.rfc}</p>
          {sesion?.despacho?.nombre && <p className="text-[11px] text-slate-500">Preparado por {sesion.despacho.nombre}</p>}
          <p className="mt-2 text-sm font-black text-brand-700">Reporte mensual</p>
          <p className="text-xs">{MESES[Number(periodo.mes) - 1]} de {periodo.anio}</p>
        </div>

        {/* Resumen ejecutivo */}
        <div>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Resumen ejecutivo</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Utilidad del periodo" valor={r ? money(r.utilidadNeta) : "—"} />
            <Tile label="Impuestos a pagar" valor={fiscal ? money(totalImpuestos) : "—"} alerta={totalImpuestos > 0} />
            <Tile label="Cartera por cobrar" valor={cartera ? money(cartera.resumen.totalCartera) : "—"} />
            <Tile label="Cartera vencida" valor={cartera ? money(carteraVencida) : "—"} alerta={carteraVencida > 0} />
          </div>
        </div>

        {/* Impuestos determinados */}
        {fiscal && (
          <div>
            <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Impuestos determinados del mes</h2>
            {!fiscal.panel.perfilConfigurado && (
              <p className="mb-1 text-[10px] text-amber-700">Perfil fiscal no configurado; el cálculo es aproximado. Importa la Constancia de Situación Fiscal para precisión.</p>
            )}
            <table className="w-full">
              <tbody>
                {conceptos.map((c) => (
                  <tr key={c.tipo} className="border-b border-slate-100">
                    <td className="py-1">{c.titulo}{c.nota ? <span className="text-[10px] text-slate-400"> · {c.nota}</span> : null}</td>
                    <td className={`py-1 text-right tabular-nums ${c.aCargo > 0 ? "font-semibold text-rose-700" : "text-emerald-700"}`}>{money(c.aCargo)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-800">
                  <td className="py-1.5 font-black">Total a pagar (vence el 17 de {MESES[Number(periodo.mes) % 12]})</td>
                  <td className="py-1.5 text-right font-black tabular-nums">{money(totalImpuestos)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Estado de resultados */}
        {r && (
          <div>
            <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Estado de resultados (acumulado)</h2>
            <table className="w-full">
              <tbody>
                <Row label="Ingresos" valor={r.ingresos.total} />
                <Row label="Costos" valor={r.costos.total} />
                <Row label="Utilidad bruta" valor={r.utilidadBruta} bold />
                <Row label="Gastos de operación" valor={r.gastos.total} />
                <Row label="Utilidad de operación" valor={r.utilidadOperacion} bold />
                <Row label="Utilidad antes de impuestos" valor={r.utilidadNeta} fuerte />
              </tbody>
            </table>
          </div>
        )}

        {/* Revisión de consistencia (amarre) */}
        {amarre && (
          <div>
            <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Revisión de consistencia fiscal</h2>
            {sinHallazgos ? (
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 className="size-3.5" /> Lo timbrado cuadra con lo contabilizado; sin observaciones del periodo.</p>
            ) : (
              <ul className="space-y-1">
                {amarre.hallazgos.map((h, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" /> {h}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="border-t border-slate-200 pt-2 text-center text-[9px] text-slate-400">
          Documento informativo preparado por tu despacho contable a partir de tus CFDI y contabilidad del periodo.
          Los importes fiscales se determinan con base en flujo de efectivo; no sustituye las declaraciones oficiales ante el SAT.
        </p>
      </div>
    </div>
  );
}

function Tile({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`tabular-nums text-sm font-black ${alerta ? "text-rose-700" : "text-slate-900"}`}>{valor}</p>
    </div>
  );
}

function Row({ label, valor, bold, fuerte }: { label: string; valor: number; bold?: boolean; fuerte?: boolean }) {
  return (
    <tr className={fuerte ? "border-t-2 border-slate-800" : bold ? "border-t border-slate-300" : "border-b border-slate-100"}>
      <td className={`py-1 ${fuerte ? "text-[13px] font-black" : bold ? "font-bold" : ""}`}>{label}</td>
      <td className={`py-1 text-right tabular-nums ${fuerte ? "text-[13px] font-black" : bold ? "font-bold" : ""}`}>{mxn.format(valor)}</td>
    </tr>
  );
}
