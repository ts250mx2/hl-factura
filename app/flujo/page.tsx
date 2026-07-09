"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertTriangle, ChevronDown, Wallet, Receipt, Landmark } from "lucide-react";
import { api, ApiError, mxn } from "@/lib/client";
import { Badge, Button, Field, Input, PageHeader, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";

interface MovimientoFlujo {
  fecha: string;
  tipo: "cobro" | "pago" | "impuesto";
  concepto: string;
  monto: number;
  vencido?: boolean;
}
interface SemanaFlujo {
  indice: number;
  inicio: string;
  fin: string;
  entradas: number;
  salidas: number;
  neto: number;
  saldoFinal: number;
  movimientos: MovimientoFlujo[];
}
interface Proyeccion {
  saldoInicial: number;
  desde: string;
  hasta: string;
  semanas: SemanaFlujo[];
  totalEntradas: number;
  totalSalidas: number;
  saldoFinal: number;
  minSaldo: number;
  minSemanaInicio: string | null;
}

const fechaDM = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

const TIPO_ICON = {
  cobro: <Wallet className="size-3.5 text-emerald-600" />,
  pago: <Receipt className="size-3.5 text-rose-600" />,
  impuesto: <Landmark className="size-3.5 text-amber-600" />,
};

export default function FlujoPage() {
  const { toast } = useToast();
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [semanas, setSemanas] = useState("8");
  const [datos, setDatos] = useState<Proyeccion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const s = Number(saldoInicial) || 0;
      setDatos(await api<Proyeccion>(`/api/flujo?semanas=${semanas}&saldoInicial=${s}`));
    } catch (e) {
      toast("error", "No se pudo calcular el flujo", e instanceof ApiError ? e.message : String(e));
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [saldoInicial, semanas, toast]);

  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);

  const enRojo = datos && datos.minSaldo < 0;

  return (
    <div>
      <PageHeader
        title="Flujo de efectivo (proyección)"
        subtitle="Anticipa tu posición de caja semana a semana: cruza lo que esperas cobrar (cartera), lo que debes pagar (proveedores) y los impuestos por enterar. Los cobros y pagos vencidos se reprograman a esta semana."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Saldo en bancos hoy" className="w-44">
          <Input
            type="number"
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            className="tnum"
            inputMode="decimal"
          />
        </Field>
        <Field label="Horizonte" className="w-40">
          <Select value={semanas} onChange={(e) => setSemanas(e.target.value)}>
            <option value="4">4 semanas</option>
            <option value="8">8 semanas</option>
            <option value="12">12 semanas</option>
            <option value="26">26 semanas</option>
          </Select>
        </Field>
      </div>

      {cargando ? (
        <Spinner label="Proyectando flujo de efectivo…" />
      ) : !datos ? null : (
        <>
          {/* Resumen */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 grid gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Entradas ({semanas} sem)</p>
              <p className="tnum mt-1 text-lg font-extrabold text-emerald-600">{mxn.format(datos.totalEntradas)}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Salidas ({semanas} sem)</p>
              <p className="tnum mt-1 text-lg font-extrabold text-rose-600">{mxn.format(datos.totalSalidas)}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Saldo proyectado</p>
              <p className={`tnum mt-1 text-lg font-extrabold ${datos.saldoFinal < 0 ? "text-rose-600" : "text-ink-900"}`}>{mxn.format(datos.saldoFinal)}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Punto más bajo</p>
              <p className={`tnum mt-1 text-lg font-extrabold ${datos.minSaldo < 0 ? "text-rose-600" : "text-ink-900"}`}>{mxn.format(datos.minSaldo)}</p>
            </div>
          </motion.div>

          {enRojo && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-bold">El flujo se queda corto</p>
                <p className="mt-1 text-xs">
                  Con el saldo inicial capturado, la caja cae a <b>{mxn.format(datos.minSaldo)}</b>
                  {datos.minSemanaInicio ? ` en la semana del ${fechaDM(datos.minSemanaInicio)}` : ""}. Considera adelantar cobros,
                  reprogramar pagos o prever financiamiento.
                </p>
              </div>
            </motion.div>
          )}

          {/* Semanas */}
          <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100 overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-2 text-[10px] font-bold uppercase text-ink-400">
              <span>Semana</span>
              <span className="text-right">Entradas</span>
              <span className="text-right">Salidas</span>
              <span className="text-right">Neto</span>
              <span className="text-right">Saldo final</span>
              <span />
            </div>
            {datos.semanas.map((s) => {
              const abierto = abierta === s.indice;
              const sinMov = s.movimientos.length === 0;
              return (
                <motion.div key={s.indice} variants={listItem}>
                  <button
                    onClick={() => setAbierta(abierto ? null : s.indice)}
                    disabled={sinMov}
                    className={`grid w-full grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] items-center gap-2 px-4 py-2.5 text-left text-xs transition ${sinMov ? "opacity-60" : "hover:bg-brand-50/40"}`}
                  >
                    <span className="font-semibold text-ink-900">{fechaDM(s.inicio)} – {fechaDM(s.fin)}</span>
                    <span className="tnum text-right text-emerald-600">{s.entradas ? mxn.format(s.entradas) : "—"}</span>
                    <span className="tnum text-right text-rose-600">{s.salidas ? `−${mxn.format(s.salidas)}` : "—"}</span>
                    <span className={`tnum text-right font-semibold ${s.neto < 0 ? "text-rose-600" : s.neto > 0 ? "text-emerald-700" : "text-ink-400"}`}>{s.neto ? mxn.format(s.neto) : "—"}</span>
                    <span className={`tnum text-right font-extrabold ${s.saldoFinal < 0 ? "text-rose-600" : "text-ink-900"}`}>{mxn.format(s.saldoFinal)}</span>
                    <ChevronDown className={`size-4 text-ink-300 transition-transform ${abierto ? "rotate-180" : ""} ${sinMov ? "invisible" : ""}`} />
                  </button>
                  {abierto && !sinMov && (
                    <div className="space-y-1 bg-slate-50/40 px-4 py-2">
                      {s.movimientos.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {TIPO_ICON[m.tipo]}
                          <span className="w-14 shrink-0 text-ink-400">{fechaDM(m.fecha)}</span>
                          <span className="min-w-0 flex-1 truncate text-ink-700">
                            {m.concepto}
                            {m.vencido && <Badge color="amber">vencido</Badge>}
                          </span>
                          <span className={`tnum shrink-0 font-semibold ${m.monto < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                            {m.monto < 0 ? "−" : "+"}{mxn.format(Math.abs(m.monto))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>

          <p className="mt-4 flex items-center gap-2 text-xs text-ink-400">
            <TrendingUp className="size-3.5 text-emerald-500" /> Entradas = cobros esperados de tu cartera PPD ·
            <TrendingDown className="size-3.5 text-rose-500" /> Salidas = proveedores por pagar + impuestos estimados.
            Los impuestos se estiman del panel fiscal y vencen el día 17.
          </p>
        </>
      )}
    </div>
  );
}
