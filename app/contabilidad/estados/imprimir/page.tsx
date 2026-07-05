"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { api, mxn } from "@/lib/client";
import { Button, Spinner } from "@/components/ui";
import { useSesion } from "@/components/session-provider";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface LineaEstado {
  codigo: string;
  nombre: string;
  importe: number;
}
interface GrupoEstado {
  titulo: string;
  lineas: LineaEstado[];
  total: number;
}
interface EstadosFinancieros {
  cuadrada: boolean;
  resultados: {
    ingresos: GrupoEstado;
    costos: GrupoEstado;
    utilidadBruta: number;
    gastos: GrupoEstado;
    utilidadOperacion: number;
    otros: GrupoEstado;
    utilidadNeta: number;
  };
  situacion: {
    activoCirculante: GrupoEstado;
    activoNoCirculante: GrupoEstado;
    totalActivo: number;
    pasivoCortoPlazo: GrupoEstado;
    pasivoLargoPlazo: GrupoEstado;
    totalPasivo: number;
    capitalContable: GrupoEstado;
    resultadoEjercicio: number;
    totalCapital: number;
    totalPasivoMasCapital: number;
    diferencia: number;
  };
}

function Grupo({ grupo }: { grupo: GrupoEstado }) {
  if (grupo.lineas.length === 0) return null;
  return (
    <>
      <tr>
        <td colSpan={2} className="pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{grupo.titulo}</td>
      </tr>
      {grupo.lineas.map((l) => (
        <tr key={l.codigo} className="border-b border-slate-100">
          <td className="py-1 pl-3"><span className="font-mono text-[10px] text-slate-400">{l.codigo}</span> {l.nombre}</td>
          <td className="py-1 text-right tabular-nums">{mxn.format(l.importe)}</td>
        </tr>
      ))}
      <tr className="border-b border-slate-300">
        <td className="py-1 text-right text-[11px] font-semibold text-slate-600">Total {grupo.titulo.toLowerCase()}</td>
        <td className="py-1 text-right font-semibold tabular-nums">{mxn.format(grupo.total)}</td>
      </tr>
    </>
  );
}

function Total({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <tr className={fuerte ? "border-t-2 border-slate-800" : "border-t border-slate-400"}>
      <td className={`py-1.5 ${fuerte ? "text-[13px] font-black" : "font-bold"}`}>{label}</td>
      <td className={`py-1.5 text-right tabular-nums ${fuerte ? "text-[13px] font-black" : "font-bold"}`}>{mxn.format(valor)}</td>
    </tr>
  );
}

function Seccion({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="border-b border-slate-800 pt-3 pb-0.5 text-[11px] font-black uppercase tracking-widest">{label}</td>
    </tr>
  );
}

export default function EstadosImprimirPage() {
  const { sesion } = useSesion();
  const [data, setData] = useState<EstadosFinancieros | null>(null);
  const [periodo, setPeriodo] = useState<{ anio: string; mes: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const anio = q.get("anio") || String(new Date().getFullYear());
    const mes = (q.get("mes") || "01").padStart(2, "0");
    setPeriodo({ anio, mes });
    api<EstadosFinancieros>(`/api/contabilidad/estados?anio=${anio}&mes=${mes}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Abre el diálogo de impresión una vez cargado (Guardar como PDF)
  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) return <p className="p-8 text-center text-sm text-rose-600">{error}</p>;
  if (!data || !periodo) return <Spinner label="Preparando estados financieros…" />;

  const empresa = sesion?.empresas.find((e) => e.id === sesion.empresaActivaId);
  const r = data.resultados;
  const s = data.situacion;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/contabilidad">
          <Button variant="ghost">
            <ArrowLeft className="size-4" /> Volver
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="print-page card bg-white p-8 text-[12px] leading-relaxed text-slate-800">
        {/* Membrete */}
        <div className="mb-5 border-b-2 border-slate-800 pb-3 text-center">
          <p className="text-lg font-black tracking-tight">{empresa?.nombre ?? "Empresa"}</p>
          <p className="font-mono text-xs">{empresa?.rfc}</p>
          {sesion?.despacho?.nombre && <p className="text-[11px] text-slate-500">{sesion.despacho.nombre}</p>}
          <p className="mt-2 text-sm font-black text-brand-700">Estados financieros</p>
          <p className="text-xs">Acumulados al {MESES[Number(periodo.mes) - 1]} de {periodo.anio}</p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Estado de resultados */}
          <div>
            <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Estado de resultados</h2>
            <table className="w-full">
              <tbody>
                <Grupo grupo={r.ingresos} />
                <Grupo grupo={r.costos} />
                <Total label="Utilidad bruta" valor={r.utilidadBruta} />
                <Grupo grupo={r.gastos} />
                <Total label="Utilidad de operación" valor={r.utilidadOperacion} />
                {r.otros.lineas.length > 0 && <Grupo grupo={r.otros} />}
                <Total label="Utilidad antes de impuestos" valor={r.utilidadNeta} fuerte />
              </tbody>
            </table>
          </div>

          {/* Estado de situación financiera */}
          <div>
            <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Estado de situación financiera</h2>
            <table className="w-full">
              <tbody>
                <Seccion label="Activo" />
                <Grupo grupo={s.activoCirculante} />
                {s.activoNoCirculante.lineas.length > 0 && <Grupo grupo={s.activoNoCirculante} />}
                <Total label="Total activo" valor={s.totalActivo} fuerte />
                <Seccion label="Pasivo" />
                <Grupo grupo={s.pasivoCortoPlazo} />
                {s.pasivoLargoPlazo.lineas.length > 0 && <Grupo grupo={s.pasivoLargoPlazo} />}
                <Total label="Total pasivo" valor={s.totalPasivo} />
                <Seccion label="Capital contable" />
                {s.capitalContable.lineas.map((l) => (
                  <tr key={l.codigo} className="border-b border-slate-100">
                    <td className="py-1 pl-3"><span className="font-mono text-[10px] text-slate-400">{l.codigo}</span> {l.nombre}</td>
                    <td className="py-1 text-right tabular-nums">{mxn.format(l.importe)}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-100">
                  <td className="py-1 pl-3">Resultado del ejercicio</td>
                  <td className="py-1 text-right tabular-nums">{mxn.format(s.resultadoEjercicio)}</td>
                </tr>
                <Total label="Total capital contable" valor={s.totalCapital} />
                <Total label="Total pasivo + capital" valor={s.totalPasivoMasCapital} fuerte />
              </tbody>
            </table>
            {Math.abs(s.diferencia) >= 0.5 && (
              <p className="mt-2 text-[10px] text-amber-700">Diferencia de cuadre: {mxn.format(s.diferencia)}.</p>
            )}
          </div>
        </div>

        <p className="mt-6 border-t border-slate-200 pt-2 text-center text-[9px] text-slate-400">
          Estados financieros construidos desde la balanza acumulada por código agrupador del SAT. Documento informativo para revisión y planeación; no sustituye la contabilidad formal ni un dictamen.
        </p>
      </div>
    </div>
  );
}
