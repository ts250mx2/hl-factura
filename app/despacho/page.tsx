"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gauge, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, CalendarCheck, Bell, Wallet, ArrowRight, Building2 } from "lucide-react";
import { api, ApiError, mxn, fechaCorta } from "@/lib/client";
import { Badge, Button, PageHeader, EmptyState, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSesion } from "@/components/session-provider";

type Severidad = "ok" | "aviso" | "critica";
interface CertEstado { presente: boolean; dias: number | null; vence: string | null }
interface EstadoEmpresa {
  empresaId: string; rfc: string; nombre: string; colorTag: string;
  csd: CertEstado; fiel: CertEstado;
  opinion: { sentido: string; fecha: string } | null;
  obligaciones: { vencidas: number; pendientes: number; presentadas: number };
  alertas: number; carteraVencida: number; carteraVencidaCount: number;
  severidad: Severidad; problemas: string[];
}
interface Resumen { empresas: number; criticas: number; avisos: number; ok: number; obligacionesVencidas: number; carteraVencida: number; alertas: number }
interface Tablero { empresas: EstadoEmpresa[]; resumen: Resumen }

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const BORDE: Record<Severidad, string> = {
  critica: "border-l-rose-500",
  aviso: "border-l-amber-400",
  ok: "border-l-emerald-500",
};

function CertBadge({ label, cert }: { label: string; cert: CertEstado }) {
  if (!cert.presente) return <Badge color="slate">{label}: falta</Badge>;
  if (cert.dias === null) return <Badge color="slate">{label}</Badge>;
  if (cert.dias < 0) return <Badge color="red">{label} vencido</Badge>;
  if (cert.dias < 30) return <Badge color="amber">{label} {cert.dias}d</Badge>;
  return <Badge color="green">{label} ✓</Badge>;
}

export default function DespachoPage() {
  const { toast } = useToast();
  const { cambiarEmpresa } = useSesion();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [datos, setDatos] = useState<Tablero | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await api<Tablero>(`/api/despacho?anio=${anio}&mes=${mes}`));
    } catch (e) {
      toast("error", "No se pudo cargar el tablero", e instanceof ApiError ? e.message : String(e));
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [anio, mes, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarMes = (d: number) => {
    const nd = new Date(anio, mes - 1 + d, 1);
    setAnio(nd.getFullYear());
    setMes(nd.getMonth() + 1);
  };

  const r = datos?.resumen;

  return (
    <div>
      <PageHeader
        title="Torre de control del despacho"
        subtitle="El estado de cumplimiento de todas tus empresas en una vista: certificados, opinión 32-D, obligaciones del mes, alertas y cartera vencida. Las que requieren atención aparecen primero."
      />

      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => cambiarMes(-1)} className="rounded-lg border border-slate-200 p-2 text-ink-600 transition hover:bg-slate-50" title="Mes anterior">
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-40 text-center text-sm font-bold text-ink-900">{MESES[mes - 1]} {anio}</p>
        <button onClick={() => cambiarMes(1)} className="rounded-lg border border-slate-200 p-2 text-ink-600 transition hover:bg-slate-50" title="Mes siguiente">
          <ChevronRight className="size-4" />
        </button>
        <span className="text-xs text-ink-400">· periodo de las obligaciones fiscales</span>
      </div>

      {cargando ? (
        <Spinner label="Evaluando el estado del despacho…" />
      ) : !datos || datos.empresas.length === 0 ? (
        <EmptyState icon={<Building2 className="size-7" />} title="Sin empresas" detail="Crea empresas (RFCs) para ver su tablero de control." />
      ) : (
        <>
          {r && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="card p-3"><p className="text-[10px] uppercase text-ink-400">Empresas</p><p className="tnum text-xl font-extrabold">{r.empresas}</p></div>
              <div className="card p-3"><p className="text-[10px] uppercase text-ink-400">Críticas</p><p className="tnum text-xl font-extrabold text-rose-600">{r.criticas}</p></div>
              <div className="card p-3"><p className="text-[10px] uppercase text-ink-400">Con avisos</p><p className="tnum text-xl font-extrabold text-amber-600">{r.avisos}</p></div>
              <div className="card p-3"><p className="text-[10px] uppercase text-ink-400">Al día</p><p className="tnum text-xl font-extrabold text-emerald-600">{r.ok}</p></div>
              <div className="card p-3"><p className="text-[10px] uppercase text-ink-400">Oblig. vencidas</p><p className="tnum text-xl font-extrabold text-rose-600">{r.obligacionesVencidas}</p></div>
              <div className="card p-3"><p className="text-[10px] uppercase text-ink-400">Cartera vencida</p><p className="tnum text-sm font-extrabold text-ink-900">{mxn.format(r.carteraVencida)}</p></div>
            </motion.div>
          )}

          <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
            {datos.empresas.map((e) => (
              <motion.div key={e.empresaId} variants={listItem} className={`card border-l-4 p-4 ${BORDE[e.severidad]}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: e.colorTag }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-ink-900">{e.nombre}</p>
                      <span className="mono text-xs text-ink-400">{e.rfc}</span>
                      {e.severidad === "critica" && <Badge color="red"><ShieldAlert className="size-3" /> Requiere atención</Badge>}
                      {e.severidad === "ok" && <Badge color="green"><ShieldCheck className="size-3" /> Al día</Badge>}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <CertBadge label="CSD" cert={e.csd} />
                      <CertBadge label="FIEL" cert={e.fiel} />
                      {e.opinion ? (
                        <Badge color={e.opinion.sentido === "negativa" ? "red" : e.opinion.sentido === "positiva" ? "green" : "slate"}>
                          32-D: {e.opinion.sentido} · {fechaCorta(e.opinion.fecha)}
                        </Badge>
                      ) : (
                        <Badge color="slate">32-D: sin descargar</Badge>
                      )}
                      <Badge color={e.obligaciones.vencidas > 0 ? "red" : e.obligaciones.pendientes > 0 ? "amber" : "green"}>
                        <CalendarCheck className="size-3" /> Oblig. {e.obligaciones.vencidas}v · {e.obligaciones.pendientes}p · {e.obligaciones.presentadas}✓
                      </Badge>
                      {e.alertas > 0 && <Badge color="amber"><Bell className="size-3" /> {e.alertas}</Badge>}
                      {e.carteraVencida > 0 && <Badge color="amber"><Wallet className="size-3" /> {mxn.format(e.carteraVencida)}</Badge>}
                    </div>

                    {e.problemas.length > 0 && (
                      <p className="mt-2 text-[11px] text-ink-500">{e.problemas.join(" · ")}</p>
                    )}
                  </div>

                  <Button variant="secondary" className="shrink-0 px-3 py-2 text-xs" onClick={() => cambiarEmpresa(e.empresaId)}>
                    Trabajar aquí <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-400">
            <Gauge className="size-3.5" /> Semáforo: rojo = certificado vencido, opinión negativa u obligaciones vencidas · ámbar = por vencer, alertas o cartera vencida · verde = al día.
          </p>
        </>
      )}
    </div>
  );
}
