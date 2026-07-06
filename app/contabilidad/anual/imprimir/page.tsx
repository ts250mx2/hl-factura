"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { api, mxn } from "@/lib/client";
import { Button, Spinner } from "@/components/ui";
import { useSesion } from "@/components/session-provider";
import type { MetodoIsr } from "@/lib/types";

const METODO_LABEL: Record<MetodoIsr, string> = {
  auto: "Automático",
  ninguno: "Sin cálculo de ISR",
  resico_pf: "RESICO · Persona Física",
  resico_pm: "RESICO · Persona Moral",
  pf_actividad: "Actividades Empresariales y Profesionales (PF)",
  arrendamiento: "Arrendamiento (PF)",
  pm_general: "Régimen General PM",
};

interface DeclaracionAnual {
  anio: string;
  metodo: MetodoIsr;
  baseIngresos: "cobrados" | "nominales";
  aplicaDeducciones: boolean;
  aplicaPersonales: boolean;
  aplicaPtu: boolean;
  ingresos: number;
  deduccionesAutorizadas: number;
  depreciacion: number;
  deduccionesPersonales: number;
  ptuPagada: number;
  perdidasFiscales: number;
  utilidadFiscal: number;
  baseGravable: number;
  isrCausado: number;
  retenciones: number;
  pagosProvisionales: number;
  isrACargo: number;
  iva: { cobrado: number; acreditable: number };
  gastosSinXml: number;
}

function Fila({ label, valor, resta, fuerte }: { label: string; valor: number; resta?: boolean; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between ${fuerte ? "border-t-2 border-slate-800 pt-1.5 text-sm font-black" : "py-0.5"}`}>
      <span className={fuerte ? "" : "text-slate-600"}>{label}</span>
      <span className={`tabular-nums ${resta ? "text-slate-700" : ""} ${fuerte ? "" : "font-semibold"}`}>
        {resta ? "−" : ""}{mxn.format(Math.abs(valor))}
      </span>
    </div>
  );
}

export default function AnualImprimirPage() {
  const { sesion } = useSesion();
  const [d, setD] = useState<DeclaracionAnual | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const anio = q.get("anio") || String(new Date().getFullYear());
    const num = (k: string) => (Number(q.get(k)) > 0 ? Number(q.get(k)) : 0);
    const query = `anio=${anio}&dedPersonales=${num("dedPersonales")}&pagosProv=${num("pagosProv")}&ptu=${num("ptu")}&perdidas=${num("perdidas")}`;
    api<DeclaracionAnual>(`/api/contabilidad/anual?${query}`)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (d) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [d]);

  if (error) return <p className="p-8 text-center text-sm text-rose-600">{error}</p>;
  if (!d) return <Spinner label="Preparando declaración anual…" />;

  const empresa = sesion?.empresas.find((e) => e.id === sesion.empresaActivaId);

  return (
    <div className="mx-auto max-w-2xl">
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
        <div className="mb-5 border-b-2 border-slate-800 pb-3 text-center">
          <p className="text-lg font-black tracking-tight">{empresa?.nombre ?? "Empresa"}</p>
          <p className="font-mono text-xs">{empresa?.rfc}</p>
          {sesion?.despacho?.nombre && <p className="text-[11px] text-slate-500">{sesion.despacho.nombre}</p>}
          <p className="mt-2 text-sm font-black text-brand-700">Declaración anual (pre-llenada)</p>
          <p className="text-xs">Ejercicio {d.anio} · {METODO_LABEL[d.metodo]}</p>
        </div>

        {d.metodo === "ninguno" ? (
          <p className="py-8 text-center text-sm text-slate-400">Sin régimen de cálculo configurado.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">Datos del ejercicio</h2>
              <Fila label={`Ingresos ${d.baseIngresos === "nominales" ? "nominales" : "cobrados"}`} valor={d.ingresos} />
              {d.aplicaDeducciones && <Fila label="Deducciones autorizadas" valor={d.deduccionesAutorizadas} resta />}
              {d.depreciacion > 0 && <Fila label="  incluye depreciación" valor={d.depreciacion} />}
              <div className="mt-3 border-t border-slate-200 pt-2">
                <Fila label="IVA cobrado del año" valor={d.iva.cobrado} />
                <Fila label="IVA acreditable del año" valor={d.iva.acreditable} />
              </div>
            </div>

            <div>
              <h2 className="mb-2 border-b border-slate-800 pb-1 text-sm font-black">ISR del ejercicio</h2>
              {d.aplicaDeducciones ? (
                <>
                  <Fila label="Utilidad fiscal" valor={d.utilidadFiscal} />
                  {d.aplicaPersonales && d.deduccionesPersonales > 0 && <Fila label="Deducciones personales" valor={d.deduccionesPersonales} resta />}
                  {d.aplicaPtu && (d.ptuPagada > 0 || d.perdidasFiscales > 0) && <Fila label="PTU y pérdidas" valor={d.ptuPagada + d.perdidasFiscales} resta />}
                  <Fila label="Base gravable" valor={d.baseGravable} />
                </>
              ) : (
                <Fila label="Ingresos base (RESICO)" valor={d.baseGravable} />
              )}
              <Fila label="ISR causado del ejercicio" valor={d.isrCausado} />
              <Fila label="Retenciones acreditables" valor={d.retenciones} resta />
              <Fila label="Pagos provisionales" valor={d.pagosProvisionales} resta />
              <div className="mt-1">
                <Fila label={d.isrACargo >= 0 ? "ISR anual a cargo" : "ISR anual a favor"} valor={d.isrACargo} fuerte />
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 border-t border-slate-200 pt-2 text-center text-[9px] text-slate-400">
          Borrador informativo del ejercicio {d.anio} calculado con la tarifa anual vigente y los CFDI registrados. La declaración definitiva puede variar (acumulados, coeficiente, topes de deducciones y actualizaciones). No sustituye la presentación ante el SAT.
        </p>
      </div>
    </div>
  );
}
