"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, ShieldX, Ban, AlertTriangle, RefreshCcw, Info, CheckCheck, Mail } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, PageHeader, EmptyState, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { Alerta } from "@/lib/types";

const ICONO: Record<string, { icon: typeof Bell; color: string }> = {
  efos: { icon: ShieldX, color: "bg-rose-100 text-rose-600" },
  cancelado: { icon: Ban, color: "bg-amber-100 text-amber-600" },
  deduccion: { icon: AlertTriangle, color: "bg-amber-100 text-amber-600" },
  sync: { icon: RefreshCcw, color: "bg-sky-100 text-sky-600" },
  csd: { icon: AlertTriangle, color: "bg-amber-100 text-amber-600" },
  cobranza: { icon: Mail, color: "bg-emerald-100 text-emerald-600" },
};

const SEVERIDAD: Record<string, "red" | "amber" | "sky"> = {
  critica: "red",
  aviso: "amber",
  info: "sky",
};

export default function AlertasPage() {
  const { toast } = useToast();
  const [datos, setDatos] = useState<{ alertas: Alerta[]; noLeidas: number } | null>(null);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);

  const cargar = useCallback(async () => {
    setDatos(await api(`/api/alertas${soloNoLeidas ? "?noLeidas=1" : ""}`));
  }, [soloNoLeidas]);

  useEffect(() => {
    cargar().catch(() => setDatos({ alertas: [], noLeidas: 0 }));
  }, [cargar]);

  const marcarTodas = async () => {
    try {
      await api("/api/alertas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todas: true }),
      });
      toast("success", "Todas las alertas marcadas como leídas");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo", e instanceof Error ? e.message : String(e));
    }
  };

  const marcarUna = async (id: string) => {
    await api("/api/alertas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    await cargar();
  };

  return (
    <div>
      <PageHeader
        title="Centro de alertas"
        subtitle="Cancelaciones detectadas por el conciliador, proveedores en la lista 69-B, CFDI no deducibles y avisos de sincronización."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSoloNoLeidas(!soloNoLeidas)}>
              {soloNoLeidas ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              {soloNoLeidas ? "Ver todas" : "Solo no leídas"}
            </Button>
            {(datos?.noLeidas ?? 0) > 0 && (
              <Button onClick={marcarTodas}>
                <CheckCheck className="size-4" /> Marcar todas leídas
              </Button>
            )}
          </div>
        }
      />

      {!datos ? (
        <Spinner label="Cargando alertas…" />
      ) : datos.alertas.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-7" />}
          title="Sin alertas"
          detail="Aquí aparecerán las cancelaciones de proveedores, coincidencias EFOS 69-B, CFDI no deducibles y el resultado de las sincronizaciones nocturnas."
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2.5">
          {datos.alertas.map((a) => {
            const cfg = ICONO[a.tipo] ?? { icon: Info, color: "bg-slate-100 text-slate-600" };
            const Icon = cfg.icon;
            return (
              <motion.div
                key={a.id}
                variants={listItem}
                className={`card flex items-start gap-3.5 p-4 ${a.leida ? "opacity-60" : ""}`}
              >
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cfg.color}`}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink-900">{a.titulo}</p>
                    <Badge color={SEVERIDAD[a.severidad] ?? "sky"}>{a.severidad}</Badge>
                    {!a.leida && <Badge color="brand">Nueva</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{a.detalle}</p>
                  <p className="mt-1 text-[10px] text-ink-400">
                    {new Date(a.creadoEl).toLocaleString("es-MX")}
                  </p>
                </div>
                {!a.leida && (
                  <button
                    onClick={() => marcarUna(a.id)}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                  >
                    Marcar leída
                  </button>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
