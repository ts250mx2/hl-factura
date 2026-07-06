"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { api, mxn } from "@/lib/client";
import { Button, Spinner } from "@/components/ui";
import { useSesion } from "@/components/session-provider";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface RenglonDiot {
  tipoTercero: string;
  tipoOperacion: string;
  rfc: string;
  nombre: string;
  base16: number;
  iva16: number;
  base8: number;
  iva8: number;
  base0: number;
  exento: number;
  ivaRetenido: number;
  ivaNoAcreditable: number;
  comprobantes: number;
}
interface DiotData {
  renglones: RenglonDiot[];
  totales: Omit<RenglonDiot, "tipoTercero" | "tipoOperacion" | "rfc" | "nombre">;
  sinXml: number;
}

const M = (v: number) => (v ? mxn.format(v) : "—");

export default function DiotImprimirPage() {
  const { sesion } = useSesion();
  const [data, setData] = useState<DiotData | null>(null);
  const [periodo, setPeriodo] = useState<{ anio: string; mes: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const anio = q.get("anio") || String(new Date().getFullYear());
    const mes = (q.get("mes") || "01").padStart(2, "0");
    setPeriodo({ anio, mes });
    api<DiotData>(`/api/contabilidad/diot?anio=${anio}&mes=${mes}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) return <p className="p-8 text-center text-sm text-rose-600">{error}</p>;
  if (!data || !periodo) return <Spinner label="Preparando DIOT…" />;

  const empresa = sesion?.empresas.find((e) => e.id === sesion.empresaActivaId);
  const t = data.totales;

  return (
    <div className="mx-auto max-w-5xl">
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

      <div className="print-page card bg-white p-8 text-[11px] leading-relaxed text-slate-800">
        <div className="mb-5 border-b-2 border-slate-800 pb-3 text-center">
          <p className="text-lg font-black tracking-tight">{empresa?.nombre ?? "Empresa"}</p>
          <p className="font-mono text-xs">{empresa?.rfc}</p>
          {sesion?.despacho?.nombre && <p className="text-[11px] text-slate-500">{sesion.despacho.nombre}</p>}
          <p className="mt-2 text-sm font-black text-brand-700">DIOT · Declaración Informativa de Operaciones con Terceros</p>
          <p className="text-xs">{MESES[Number(periodo.mes) - 1]} de {periodo.anio} · {data.renglones.length} proveedor(es)</p>
        </div>

        {data.renglones.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Sin operaciones con terceros en el periodo.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-800 text-left text-[9px] uppercase text-slate-500">
                <th className="py-1.5 pr-2">Proveedor</th>
                <th className="py-1.5 pr-2">Tipo</th>
                <th className="py-1.5 pr-2 text-right">Base 16%</th>
                <th className="py-1.5 pr-2 text-right">IVA 16%</th>
                <th className="py-1.5 pr-2 text-right">Base 8%</th>
                <th className="py-1.5 pr-2 text-right">Base 0%</th>
                <th className="py-1.5 pr-2 text-right">Exento</th>
                <th className="py-1.5 pr-2 text-right">IVA ret.</th>
                <th className="py-1.5 text-right">IVA no acr.</th>
              </tr>
            </thead>
            <tbody>
              {data.renglones.map((r) => (
                <tr key={r.rfc} className="border-b border-slate-100">
                  <td className="py-1 pr-2">
                    <span className="font-mono text-[9px] text-slate-400">{r.rfc}</span>
                    <span className="block max-w-[14rem] truncate">{r.nombre}</span>
                  </td>
                  <td className="py-1 pr-2 font-mono text-[10px]">{r.tipoTercero}·{r.tipoOperacion}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{M(r.base16)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{M(r.iva16)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{M(r.base8)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{M(r.base0)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{M(r.exento)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{M(r.ivaRetenido)}</td>
                  <td className="py-1 text-right tabular-nums">{M(r.ivaNoAcreditable)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-800 font-black">
                <td className="py-1.5 pr-2">Totales</td>
                <td />
                <td className="py-1.5 pr-2 text-right tabular-nums">{mxn.format(t.base16)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{mxn.format(t.iva16)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{mxn.format(t.base8)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{mxn.format(t.base0)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{mxn.format(t.exento)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{mxn.format(t.ivaRetenido)}</td>
                <td className="py-1.5 text-right tabular-nums">{mxn.format(t.ivaNoAcreditable)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <p className="mt-6 border-t border-slate-200 pt-2 text-[9px] text-slate-400">
          Operaciones con proveedores tomadas de los CFDI recibidos y pagados (PUE) del periodo. Clasificadas como «85 · Otros» por defecto; ajusta el tipo de operación en el portal del SAT si aplica. Documento informativo para revisión.
        </p>
      </div>
    </div>
  );
}
