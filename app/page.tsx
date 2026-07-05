"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FileCheck2,
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  FilePlus2,
  Building2,
  ShieldAlert,
  Receipt,
} from "lucide-react";
import { api, mxn, fechaCorta } from "@/lib/client";
import { AnimatedNumber, BarChart, type MesDato } from "@/components/charts";
import { Badge, Spinner, listContainer, listItem } from "@/components/ui";
import { useSesion } from "@/components/session-provider";
import type { Factura } from "@/lib/types";

function EstadoCert({ etiqueta, cert }: { etiqueta: string; cert: { dias: number | null } | null }) {
  if (!cert) return <Badge color="slate">{etiqueta} pendiente</Badge>;
  if (cert.dias !== null && cert.dias < 0) return <Badge color="red">{etiqueta} vencido</Badge>;
  if (cert.dias !== null && cert.dias < 90) return <Badge color="amber">{etiqueta} {cert.dias}d</Badge>;
  return <Badge color="green">{etiqueta} ✓</Badge>;
}

interface EmpresaResumen {
  id: string;
  rfc: string;
  nombre: string;
  colorTag: string;
  csd: { dias: number | null; vence: string } | null;
  fiel: { dias: number | null; vence: string } | null;
  timbradas: number;
  conError: number;
  facturadoMes: number;
  clientes: number;
}

interface DashboardData {
  rol: string;
  empresas: EmpresaResumen[];
  alertasNoLeidas: number;
  boveda: { total: number; cancelados: number; noDeducibles: number; efos: number };
  totales: {
    emisores: number;
    clientes: number;
    productos: number;
    facturas: number;
    timbradas: number;
    canceladas: number;
    conError: number;
    facturadoMes: number;
    facturadoMesAnterior: number;
  };
  meses: MesDato[];
  topClientes: { rfc: string; nombre: string; total: number; cantidad: number }[];
  csdPorVencer: { emisor: string; rfc: string; vence: string; dias: number }[];
  recientes: Factura[];
  modoPac: string;
}

const ESTADO_BADGE: Record<string, { color: "green" | "red" | "amber" | "slate" | "brand"; label: string }> = {
  timbrada: { color: "green", label: "Timbrada" },
  cancelada: { color: "red", label: "Cancelada" },
  error: { color: "amber", label: "Error" },
  sellada: { color: "brand", label: "Sellada" },
  borrador: { color: "slate", label: "Borrador" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { sesion, cambiarEmpresa } = useSesion();

  useEffect(() => {
    api<DashboardData>("/api/dashboard").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Spinner label="Cargando tu panel…" />;

  const { totales } = data;
  const delta =
    totales.facturadoMesAnterior > 0
      ? ((totales.facturadoMes - totales.facturadoMesAnterior) / totales.facturadoMesAnterior) * 100
      : null;
  const sinDatos = totales.emisores === 0;

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Hola 👋</h1>
          <p className="mt-1 text-sm text-ink-600">
            Tu portal de facturación CFDI 4.0 conectado al ecosistema del SAT.
          </p>
        </div>
        {data.modoPac === "demo" && (
          <Link
            href="/configuracion"
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            <ShieldAlert className="size-4" />
            Modo DEMO: timbres de práctica sin validez fiscal — configura tu PAC aquí
          </Link>
        )}
      </motion.div>

      {sinDatos && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mb-6 flex flex-wrap items-center justify-between gap-4 border-brand-200 bg-gradient-to-r from-brand-50 via-white to-violet-50 p-6"
        >
          <div>
            <p className="text-base font-bold text-ink-900">Empecemos: da de alta tu primer emisor</p>
            <p className="mt-1 max-w-xl text-sm text-ink-600">
              Registra la empresa o persona que factura, sube su CSD (certificado de sello digital) y su
              FIEL, y estarás listo para emitir tu primera factura.
            </p>
          </div>
          <Link
            href="/emisores"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110"
          >
            <Building2 className="size-4" />
            Crear emisor
          </Link>
        </motion.div>
      )}

      {/* Tarjetas de métricas */}
      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4"
      >
        <motion.div variants={listItem} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Facturado este mes</p>
            <TrendingUp className="size-4 text-brand-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">
            <AnimatedNumber value={totales.facturadoMes} money />
          </p>
          {delta !== null && (
            <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${delta >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta).toFixed(1)}% vs mes anterior
            </p>
          )}
        </motion.div>

        <motion.div variants={listItem} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Facturas timbradas</p>
            <FileCheck2 className="size-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">
            <AnimatedNumber value={totales.timbradas} />
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {totales.canceladas} cancelada{totales.canceladas === 1 ? "" : "s"} · {totales.conError} con error
          </p>
        </motion.div>

        <motion.div variants={listItem} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Clientes</p>
            <Users className="size-4 text-sky-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">
            <AnimatedNumber value={totales.clientes} />
          </p>
          <p className="mt-1 text-xs text-ink-400">{totales.productos} productos en catálogo</p>
        </motion.div>

        <motion.div variants={listItem} className="card p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Emisores</p>
            <Building2 className="size-4 text-violet-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">
            <AnimatedNumber value={totales.emisores} />
          </p>
          <p className="mt-1 text-xs text-ink-400">con CSD y FIEL administrados aquí</p>
        </motion.div>
      </motion.div>

      {/* Alertas fiscales pendientes */}
      {data.alertasNoLeidas > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Link
            href="/alertas"
            className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-100"
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
            </span>
            Tienes {data.alertasNoLeidas} alerta{data.alertasNoLeidas === 1 ? "" : "s"} fiscal
            {data.alertasNoLeidas === 1 ? "" : "es"} sin revisar
            {data.boveda.efos > 0 && ` · ${data.boveda.efos} CFDI con proveedor en lista 69-B`}
            {data.boveda.noDeducibles > 0 && ` · ${data.boveda.noDeducibles} no deducibles`}
            <span className="ml-auto text-xs">Ver alertas →</span>
          </Link>
        </motion.div>
      )}

      {/* Panel maestro: cumplimiento por empresa (RFC) */}
      {data.empresas.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card mb-6 p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Panel del despacho</h2>
              <p className="text-xs text-ink-400">Estatus de cumplimiento de cada RFC que administras</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.empresas.map((e) => (
              <div key={e.id} className="rounded-xl border border-slate-100 p-3.5 transition hover:border-brand-200 hover:shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                    style={{ background: e.colorTag }}
                  >
                    {e.nombre.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{e.nombre}</p>
                    <p className="mono text-[11px] text-ink-400">{e.rfc}</p>
                  </div>
                  {sesion?.empresaActivaId === e.id ? (
                    <Badge color="brand">Activa</Badge>
                  ) : (
                    <button
                      onClick={() => cambiarEmpresa(e.id)}
                      className="rounded-lg px-2 py-1 text-[11px] font-bold text-brand-600 transition hover:bg-brand-50"
                    >
                      Operar →
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  <EstadoCert etiqueta="CSD" cert={e.csd} />
                  <EstadoCert etiqueta="FIEL" cert={e.fiel} />
                  {e.conError > 0 && <Badge color="red">{e.conError} error{e.conError > 1 ? "es" : ""}</Badge>}
                </div>
                <div className="mt-2.5 flex items-baseline justify-between text-xs">
                  <span className="text-ink-400">{e.timbradas} timbradas · {e.clientes} clientes</span>
                  <span className="tnum font-bold text-ink-900">{mxn.format(e.facturadoMes)}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Alertas de certificados */}
      {data.csdPorVencer.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 space-y-2"
        >
          {data.csdPorVencer.map((c) => (
            <div
              key={c.rfc}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                c.dias < 0
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                El CSD de <b>{c.emisor}</b> ({c.rfc}){" "}
                {c.dias < 0 ? `venció el ${fechaCorta(c.vence)}` : `vence en ${c.dias} días (${fechaCorta(c.vence)})`}
                . Renueva a tiempo en el SAT para no dejar de facturar.
              </span>
            </div>
          ))}
        </motion.div>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Gráfica de facturación */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card p-5 xl:col-span-3"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink-900">Facturación de los últimos 6 meses</h2>
              <p className="text-xs text-ink-400">Total timbrado por mes (MXN)</p>
            </div>
          </div>
          <BarChart data={data.meses} />
        </motion.div>

        {/* Top clientes */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-5 xl:col-span-2"
        >
          <h2 className="mb-4 text-sm font-bold text-ink-900">Top clientes</h2>
          {data.topClientes.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-400">
              Aquí verás a tus mejores clientes cuando empieces a facturar.
            </p>
          ) : (
            <div className="space-y-3.5">
              {data.topClientes.map((c, i) => {
                const maxTotal = data.topClientes[0].total || 1;
                return (
                  <div key={c.rfc}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900">{c.nombre}</p>
                      <p className="tnum shrink-0 text-xs font-bold text-ink-600">{mxn.format(c.total)}</p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(c.total / maxTotal) * 100}%` }}
                        transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 120, damping: 20 }}
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* Facturas recientes */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card mt-4 p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-900">Facturas recientes</h2>
          <Link href="/facturas" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            Ver todas →
          </Link>
        </div>
        {data.recientes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Receipt className="size-8 text-ink-400" />
            <p className="text-sm text-ink-600">Aún no emites facturas.</p>
            <Link
              href="/facturas/nueva"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-500"
            >
              <FilePlus2 className="size-4" /> Emitir la primera
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recientes.map((f) => {
              const badge = ESTADO_BADGE[f.estado] ?? ESTADO_BADGE.borrador;
              return (
                <Link
                  key={f.id}
                  href={`/facturas/${f.id}`}
                  className="flex items-center gap-4 py-3 transition hover:bg-slate-50"
                >
                  <span className="tnum w-20 shrink-0 text-xs font-bold text-ink-600">
                    {f.serie}-{f.folio}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">
                    {f.receptorNombre}
                  </span>
                  <span className="hidden text-xs text-ink-400 sm:block">{fechaCorta(f.creadoEl)}</span>
                  <Badge color={badge.color}>{badge.label}</Badge>
                  <span className="tnum w-28 shrink-0 text-right text-sm font-bold">
                    {mxn.format(f.total)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
