"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, UploadCloud, Sparkles, CheckCircle2, HelpCircle, XCircle, History } from "lucide-react";
import { api, postJson, ApiError, mxn } from "@/lib/client";
import { Badge, Button, PageHeader, EmptyState, Select, Spinner, Input, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";

interface Candidato {
  facturaId: string;
  folio: string;
  cliente: string;
  saldo: number;
  total: number;
  puntuacion: number;
  razon: string;
}

interface Deposito {
  fecha: string;
  referencia: string;
  monto: number;
  hash: string;
  estado: "ya_conciliado" | "exacta" | "varias" | "parcial" | "sin_coincidencia";
  candidatos: Candidato[];
}

interface Historial {
  id: string;
  fecha: string;
  referencia: string;
  monto: number;
  creadoEl: string;
}

const ESTADO_UI: Record<Deposito["estado"], { color: "green" | "amber" | "sky" | "slate" | "red"; label: string }> = {
  exacta: { color: "green", label: "Coincidencia exacta" },
  varias: { color: "amber", label: "Varias candidatas" },
  parcial: { color: "sky", label: "Posible pago parcial" },
  sin_coincidencia: { color: "slate", label: "Sin coincidencia" },
  ya_conciliado: { color: "red", label: "Ya conciliado antes" },
};

export default function ConciliacionPage() {
  const { toast } = useToast();
  const [depositos, setDepositos] = useState<Deposito[] | null>(null);
  const [meta, setMeta] = useState<{ totalLineas: number; ignorados: number; advertencia?: string } | null>(null);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({}); // hash → facturaId
  const [fechas, setFechas] = useState<Record<string, string>>({}); // hash → fecha corregida
  const [analizando, setAnalizando] = useState(false);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [arrastrando, setArrastrando] = useState(false);

  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial(await api<Historial[]>("/api/conciliacion"));
    } catch {}
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const analizar = async (file: File) => {
    setAnalizando(true);
    setDepositos(null);
    try {
      const form = new FormData();
      form.set("archivo", file);
      const r = await api<{ depositos: Deposito[]; totalLineas: number; ignorados: number; advertencia?: string }>(
        "/api/conciliacion/analizar",
        { method: "POST", body: form },
      );
      setDepositos(r.depositos);
      setMeta({ totalLineas: r.totalLineas, ignorados: r.ignorados, advertencia: r.advertencia });
      const sel: Record<string, string> = {};
      const fch: Record<string, string> = {};
      for (const d of r.depositos) {
        if (d.estado === "exacta") sel[d.hash] = d.candidatos[0].facturaId;
        fch[d.hash] = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : "";
      }
      setSeleccion(sel);
      setFechas(fch);
      if (r.advertencia) toast("info", "Aviso del parser", r.advertencia);
      const exactas = r.depositos.filter((d) => d.estado === "exacta").length;
      toast("success", `${r.depositos.length} depósito(s) detectados`, `${exactas} con coincidencia exacta · ${r.ignorados} movimiento(s) ignorados (cargos o sin importe).`);
    } catch (e) {
      toast("error", "No se pudo leer el archivo", e instanceof ApiError ? e.message : String(e));
    } finally {
      setAnalizando(false);
    }
  };

  const aplicar = async (d: Deposito) => {
    const facturaId = seleccion[d.hash];
    const fecha = fechas[d.hash];
    if (!facturaId) {
      toast("error", "Selecciona la factura a la que aplica este depósito");
      return;
    }
    if (!fecha) {
      toast("error", "Corrige la fecha del depósito (AAAA-MM-DD)");
      return;
    }
    setAplicando(d.hash);
    try {
      const r = await postJson<{ pago: { serie: string; folio: string; estado: string; errorMsg?: string }; aplicado: number; sobrante: number }>(
        "/api/conciliacion/aplicar",
        { fecha, referencia: d.referencia, monto: d.monto, facturaId },
      );
      if (r.pago.estado === "timbrada") {
        toast("success", `REP ${r.pago.serie}-${r.pago.folio} timbrado`, `${mxn.format(r.aplicado)} aplicados.${r.sobrante > 0 ? ` Sobrante sin aplicar: ${mxn.format(r.sobrante)}.` : ""}`);
        setDepositos((ds) => ds?.map((x) => (x.hash === d.hash ? { ...x, estado: "ya_conciliado" as const } : x)) ?? null);
        await cargarHistorial();
      } else {
        toast("error", "El REP no se timbró", r.pago.errorMsg);
      }
    } catch (e) {
      toast("error", "No se pudo aplicar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setAplicando(null);
    }
  };

  const aplicarExactas = async () => {
    if (!depositos) return;
    for (const d of depositos.filter((x) => x.estado === "exacta")) {
      // secuencial para respetar folios y saldos
      // eslint-disable-next-line no-await-in-loop
      await aplicar(d);
    }
  };

  const exactasPendientes = depositos?.filter((d) => d.estado === "exacta").length ?? 0;

  return (
    <div>
      <PageHeader
        title="Conciliación bancaria"
        subtitle="Sube tu estado de cuenta (CSV): detecto los depósitos, los emparejo con tu cartera PPD y genero los complementos de pago al confirmar."
        actions={
          exactasPendientes > 0 ? (
            <Button onClick={aplicarExactas} loading={Boolean(aplicando)}>
              <Sparkles className="size-4" /> Aplicar {exactasPendientes} exacta(s)
            </Button>
          ) : undefined
        }
      />

      {/* Zona de carga */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = e.dataTransfer.files?.[0];
          if (f) analizar(f);
        }}
        className={`card mb-5 flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition ${arrastrando ? "border-brand-500 bg-brand-50/60" : "border-slate-200"}`}
      >
        <motion.div animate={arrastrando ? { scale: 1.12 } : { scale: 1 }} className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-violet-100 text-brand-600">
          <UploadCloud className="size-6" />
        </motion.div>
        <p className="text-sm font-bold">Arrastra el estado de cuenta (CSV / TXT)</p>
        <p className="text-xs text-ink-400">
          Acepta exportaciones de cualquier banco: detecto delimitador, columnas de fecha/abono/concepto y formatos de fecha automáticamente.
        </p>
        <label className="cursor-pointer">
          <span className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:border-brand-300">
            Elegir archivo…
          </span>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) analizar(f); }} />
        </label>
      </div>

      {analizando && <Spinner label="Leyendo estado de cuenta y emparejando con la cartera…" />}

      {/* Resultados */}
      {depositos && (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
          {depositos.length === 0 ? (
            <EmptyState icon={<ArrowLeftRight className="size-7" />} title="Sin depósitos en el archivo" detail={`Se leyeron ${meta?.totalLineas ?? 0} líneas (${meta?.ignorados ?? 0} eran cargos o no tenían importe).`} />
          ) : (
            depositos.map((d) => {
              const ui = ESTADO_UI[d.estado];
              const icono =
                d.estado === "exacta" ? <CheckCircle2 className="size-5 text-emerald-600" /> :
                d.estado === "ya_conciliado" ? <XCircle className="size-5 text-ink-400" /> :
                d.estado === "sin_coincidencia" ? <XCircle className="size-5 text-slate-400" /> :
                <HelpCircle className="size-5 text-amber-500" />;
              return (
                <motion.div key={d.hash} variants={listItem} className={`card p-4 ${d.estado === "ya_conciliado" ? "opacity-55" : ""}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="shrink-0">{icono}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tnum text-sm font-extrabold">{mxn.format(d.monto)}</span>
                        <Badge color={ui.color}>{ui.label}</Badge>
                        {/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? (
                          <span className="text-xs text-ink-400">{d.fecha}</span>
                        ) : (
                          <Input
                            type="date"
                            value={fechas[d.hash] ?? ""}
                            onChange={(e) => setFechas({ ...fechas, [d.hash]: e.target.value })}
                            className="w-40 px-2 py-1 text-xs"
                          />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-400" title={d.referencia}>{d.referencia || "(sin concepto)"}</p>
                    </div>

                    {d.estado !== "ya_conciliado" && d.candidatos.length > 0 && (
                      <>
                        <Select
                          value={seleccion[d.hash] ?? ""}
                          onChange={(e) => setSeleccion({ ...seleccion, [d.hash]: e.target.value })}
                          className="max-w-md py-2 text-xs"
                        >
                          <option value="">Selecciona la factura…</option>
                          {d.candidatos.map((c) => (
                            <option key={c.facturaId} value={c.facturaId}>
                              {c.folio} · {c.cliente.slice(0, 28)} · saldo {mxn.format(c.saldo)} · {c.razon}
                            </option>
                          ))}
                        </Select>
                        <Button
                          onClick={() => aplicar(d)}
                          loading={aplicando === d.hash}
                          disabled={!seleccion[d.hash]}
                          className="px-3 py-2 text-xs"
                        >
                          Aplicar y generar REP
                        </Button>
                      </>
                    )}
                    {d.estado === "sin_coincidencia" && (
                      <span className="text-xs text-ink-400">No hay facturas PPD con ese monto o referencia.</span>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div className="card mt-6 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold">
            <History className="size-4 text-brand-600" /> Últimas conciliaciones aplicadas
          </p>
          <div className="divide-y divide-slate-50">
            {historial.slice(0, 10).map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="text-ink-400">{h.fecha}</span>
                <span className="min-w-0 flex-1 truncate text-ink-600">{h.referencia}</span>
                <span className="tnum font-bold">{mxn.format(h.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
