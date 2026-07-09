"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarCheck, ChevronLeft, ChevronRight, AlertTriangle, Building2 } from "lucide-react";
import { api, postJson, ApiError, fechaCorta } from "@/lib/client";
import { Badge, Button, PageHeader, EmptyState, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";

type EstadoObligacion = "presentado" | "pendiente" | "por_vencer" | "vencido";

interface ObligacionCalendario {
  clave: string;
  tipo: string;
  label: string;
  periodicidad: "mensual" | "anual";
  periodoTrabajado: string;
  vence: string;
  estado: EstadoObligacion;
  presentadoEl?: string;
  nota?: string;
}

interface EmpresaCalendario {
  empresaId: string;
  rfc: string;
  nombre: string;
  colorTag: string;
  estimado: boolean;
  obligaciones: ObligacionCalendario[];
}

interface Resumen {
  total: number;
  pendiente: number;
  por_vencer: number;
  vencido: number;
  presentado: number;
  empresasConVencidas: number;
}

interface Tablero {
  periodo: string;
  empresas: EmpresaCalendario[];
  resumen: Resumen;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ESTADO: Record<EstadoObligacion, { color: "green" | "red" | "amber" | "slate"; label: string }> = {
  presentado: { color: "green", label: "Presentada" },
  pendiente: { color: "slate", label: "Pendiente" },
  por_vencer: { color: "amber", label: "Por vencer" },
  vencido: { color: "red", label: "Vencida" },
};

export default function CalendarioPage() {
  const { toast } = useToast();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  // silencioso: recarga sin mostrar el spinner de pantalla completa (para no
  // borrar la actualización optimista tras marcar una obligación).
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        setTablero(await api<Tablero>(`/api/contabilidad/calendario?anio=${anio}&mes=${mes}`));
      } catch (e) {
        toast("error", "No se pudo cargar el calendario", e instanceof ApiError ? e.message : String(e));
        if (!silencioso) setTablero(null);
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [anio, mes, toast],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarMes = (delta: number) => {
    const d = new Date(anio, mes - 1 + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth() + 1);
  };

  const alternar = async (empresa: EmpresaCalendario, o: ObligacionCalendario) => {
    if (!tablero) return;
    const marcar = o.estado !== "presentado";
    const key = `${empresa.empresaId}|${o.clave}`;
    setGuardando(key);
    // Actualización optimista: refleja el cambio de inmediato.
    const previo = tablero;
    setTablero({
      ...tablero,
      empresas: tablero.empresas.map((e) =>
        e.empresaId !== empresa.empresaId
          ? e
          : {
              ...e,
              obligaciones: e.obligaciones.map((x) =>
                x.clave !== o.clave
                  ? x
                  : { ...x, estado: marcar ? "presentado" : recalcularEstado(x.vence), presentadoEl: marcar ? new Date().toISOString() : undefined },
              ),
            },
      ),
    });
    try {
      await postJson("/api/contabilidad/calendario", {
        empresaId: empresa.empresaId,
        clave: o.clave,
        periodo: tablero.periodo,
        presentado: marcar,
      });
      // Recarga silenciosa para recomputar el resumen sin parpadeo (sin spinner).
      await cargar(true);
    } catch (e) {
      setTablero(previo); // revertir
      toast("error", "No se pudo guardar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(null);
    }
  };

  const r = tablero?.resumen;

  return (
    <div>
      <PageHeader
        title="Calendario de obligaciones"
        subtitle="Las declaraciones que la empresa activa («Trabajando en») debe presentar en el mes, con su fecha límite y estatus. Las obligaciones se toman de la Constancia de Situación Fiscal (o se estiman del régimen)."
      />

      {/* Selector de mes */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => cambiarMes(-1)} className="rounded-lg border border-slate-200 p-2 text-ink-600 transition hover:bg-slate-50" title="Mes anterior">
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-44 text-center text-sm font-bold text-ink-900">
          {MESES[mes - 1]} {anio}
        </p>
        <button onClick={() => cambiarMes(1)} className="rounded-lg border border-slate-200 p-2 text-ink-600 transition hover:bg-slate-50" title="Mes siguiente">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Resumen del despacho */}
      {r && r.total > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 flex flex-wrap gap-2">
          {r.vencido > 0 && <Badge color="red">{r.vencido} vencida(s)</Badge>}
          {r.por_vencer > 0 && <Badge color="amber">{r.por_vencer} por vencer</Badge>}
          <Badge color="slate">{r.pendiente} pendiente(s)</Badge>
          <Badge color="green">{r.presentado} presentada(s)</Badge>
          {r.empresasConVencidas > 0 && (
            <span className="ml-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
              <AlertTriangle className="size-3.5" /> {r.empresasConVencidas} empresa(s) con vencidas
            </span>
          )}
        </motion.div>
      )}

      {cargando ? (
        <Spinner label="Calculando obligaciones…" />
      ) : !tablero || tablero.empresas.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-7" />}
          title="Sin empresas"
          detail="Crea empresas (RFCs) para ver su calendario de obligaciones."
          action={
            <Link href="/emisores">
              <Button variant="secondary">Ir a Empresas</Button>
            </Link>
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-4">
          {tablero.empresas.map((e) => (
            <motion.div key={e.empresaId} variants={listItem} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.colorTag }} />
                <p className="text-sm font-bold text-ink-900">{e.nombre}</p>
                <span className="mono text-xs text-ink-400">{e.rfc}</span>
                {e.estimado && (
                  <span title="No hay CSF importada; las obligaciones se estimaron del régimen fiscal.">
                    <Badge color="amber">Estimado (sin CSF)</Badge>
                  </span>
                )}
                <span className="ml-auto text-xs text-ink-400">
                  {e.obligaciones.length} obligación(es)
                </span>
              </div>

              {e.obligaciones.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-400">Sin obligaciones a presentar este mes.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {e.obligaciones.map((o) => {
                    const badge = ESTADO[o.estado];
                    const key = `${e.empresaId}|${o.clave}`;
                    const presentado = o.estado === "presentado";
                    return (
                      <div key={o.clave} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={presentado}
                            disabled={guardando === key}
                            onChange={() => alternar(e, o)}
                            className="size-4 accent-emerald-600"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-semibold ${presentado ? "text-ink-400 line-through" : "text-ink-900"}`}>
                            {o.label}
                          </p>
                          <p className="text-[11px] text-ink-400">
                            {o.periodicidad === "anual" ? `Ejercicio ${o.periodoTrabajado}` : `Periodo ${o.periodoTrabajado}`} · vence {o.vence}
                            {presentado && o.presentadoEl ? ` · presentada ${fechaCorta(o.presentadoEl)}` : ""}
                          </p>
                        </div>
                        <Badge color={badge.color}>{badge.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

// Estado local aproximado al desmarcar (el servidor lo recalcula al recargar).
function recalcularEstado(vence: string): EstadoObligacion {
  const d = new Date();
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (hoy > vence) return "vencido";
  const dias = Math.round((new Date(`${vence}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86_400_000);
  return dias <= 5 ? "por_vencer" : "pendiente";
}
