"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wallet, Mail, HandCoins } from "lucide-react";
import { api, postJson, ApiError, mxn } from "@/lib/client";
import { Badge, Button, PageHeader, EmptyState, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { FiltroPeriodo, usePeriodo } from "@/components/filtro-periodo";
import type { Factura } from "@/lib/types";

interface ItemCartera {
  factura: Factura;
  saldo: number;
  pagado: number;
  parcialidades: number;
  vencimiento: string;
  diasParaVencer: number;
  bucket: string;
}

interface ResumenCartera {
  totalCartera: number;
  facturas: number;
  buckets: Record<string, { total: number; cantidad: number }>;
}

const BUCKETS: { clave: string; label: string; color: string }[] = [
  { clave: "al_corriente", label: "Al corriente", color: "bg-emerald-500" },
  { clave: "por_vencer", label: "Por vencer (≤7 días)", color: "bg-amber-400" },
  { clave: "vencida_30", label: "Vencida 1–30 días", color: "bg-orange-500" },
  { clave: "vencida_60", label: "Vencida 31–60 días", color: "bg-rose-500" },
  { clave: "vencida_mas", label: "Vencida +60 días", color: "bg-rose-700" },
];

function BadgeVencimiento({ dias }: { dias: number }) {
  if (dias > 7) return <Badge color="green">{dias} días para vencer</Badge>;
  if (dias >= 0) return <Badge color="amber">vence en {dias} día{dias === 1 ? "" : "s"}</Badge>;
  return <Badge color="red">vencida hace {-dias} día{dias === -1 ? "" : "s"}</Badge>;
}

export default function CxcPage() {
  const { toast } = useToast();
  const [datos, setDatos] = useState<{ items: ItemCartera[]; resumen: ResumenCartera } | null>(null);
  const [filtro, setFiltro] = useState("");
  const periodoCtrl = usePeriodo(); // default: este mes (fecha de emisión de la factura)
  const [enviando, setEnviando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setDatos(await api("/api/cxc"));
  }, []);

  useEffect(() => {
    cargar().catch(() => setDatos(null));
  }, [cargar]);

  const recordar = async (item: ItemCartera) => {
    setEnviando(item.factura.id);
    try {
      const r = await postJson<{ para: string }>("/api/cxc/recordatorio", { facturaId: item.factura.id });
      toast("success", "Recordatorio enviado", `Se envió a ${r.para}.`);
    } catch (e) {
      toast("error", "No se pudo enviar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setEnviando(null);
    }
  };

  if (!datos) return <Spinner label="Calculando cartera…" />;

  // El periodo filtra por la fecha de emisión de la factura; el resumen de
  // cartera se recalcula sobre ese subconjunto para que cuadre con la lista.
  const delPeriodo = datos.items.filter((i) => periodoCtrl.enPeriodo(i.factura.fecha));
  const resumen: ResumenCartera = {
    totalCartera: delPeriodo.reduce((s, i) => s + i.saldo, 0),
    facturas: delPeriodo.length,
    buckets: delPeriodo.reduce<ResumenCartera["buckets"]>((acc, i) => {
      const b = acc[i.bucket] ?? { total: 0, cantidad: 0 };
      acc[i.bucket] = { total: b.total + i.saldo, cantidad: b.cantidad + 1 };
      return acc;
    }, {}),
  };
  const items = filtro ? delPeriodo.filter((i) => i.bucket === filtro) : delPeriodo;
  const max = Math.max(...BUCKETS.map((b) => resumen.buckets[b.clave]?.total ?? 0), 1);

  return (
    <div>
      <PageHeader
        title="Cuentas por cobrar"
        subtitle="Facturas PPD con saldo pendiente, clasificadas por antigüedad. Los saldos se actualizan solos con cada complemento de pago."
        actions={
          <Link href="/pagos">
            <Button>
              <HandCoins className="size-4" /> Registrar pago
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FiltroPeriodo ctrl={periodoCtrl} />
        <p className="text-xs text-ink-400">Filtra por la fecha de emisión de la factura.</p>
      </div>

      {/* Resumen de cartera */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Cartera total</p>
            <p className="tnum text-3xl font-extrabold tracking-tight text-brand-700">
              {mxn.format(resumen.totalCartera)}
            </p>
          </div>
          <p className="text-sm text-ink-600">{resumen.facturas} factura(s) con saldo</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-5">
          {BUCKETS.map((b) => {
            const info = resumen.buckets[b.clave] ?? { total: 0, cantidad: 0 };
            const activo = filtro === b.clave;
            return (
              <button
                key={b.clave}
                onClick={() => setFiltro(activo ? "" : b.clave)}
                className={`rounded-xl border-2 p-3 text-left transition ${activo ? "border-brand-500 bg-brand-50/50" : "border-slate-100 hover:border-brand-200"}`}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${b.color}`} />
                  <span className="text-[11px] font-bold text-ink-600">{b.label}</span>
                </div>
                <p className="tnum text-sm font-extrabold">{mxn.format(info.total)}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${b.color}`} style={{ width: `${(info.total / max) * 100}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-ink-400">{info.cantidad} factura(s)</p>
              </button>
            );
          })}
        </div>
      </motion.div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-7" />}
          title={filtro || periodoCtrl.desde || periodoCtrl.hasta ? "Nada con estos filtros" : "¡Cartera limpia!"}
          detail={
            filtro || periodoCtrl.desde || periodoCtrl.hasta
              ? "Prueba con otro rango de antigüedad o periodo. Ojo: las facturas vencidas de meses anteriores no aparecen en «Este mes»."
              : "No hay facturas PPD con saldo pendiente de cobro."
          }
          action={
            periodoCtrl.desde || periodoCtrl.hasta ? (
              <Button variant="secondary" onClick={() => periodoCtrl.aplicar("")}>
                Ver cualquier fecha
              </Button>
            ) : undefined
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100">
          {items.map((item) => (
            <motion.div key={item.factura.id} variants={listItem} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <Link href={`/facturas/${item.factura.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-extrabold text-ink-600">
                  {item.factura.serie}-{item.factura.folio}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900">{item.factura.receptorNombre}</p>
                  <p className="text-xs text-ink-400">
                    Emitida {item.factura.fecha.slice(0, 10)} · vence {item.vencimiento}
                    {item.parcialidades > 0 && ` · ${item.parcialidades} pago(s) previos`}
                  </p>
                </div>
              </Link>
              <BadgeVencimiento dias={item.diasParaVencer} />
              <div className="text-right">
                <p className="tnum text-sm font-extrabold">{mxn.format(item.saldo)}</p>
                {item.pagado > 0 && <p className="tnum text-[10px] text-emerald-700">pagado {mxn.format(item.pagado)}</p>}
              </div>
              <Button variant="secondary" onClick={() => recordar(item)} loading={enviando === item.factura.id} className="px-3 py-2 text-xs">
                <Mail className="size-3.5" /> Recordar
              </Button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
