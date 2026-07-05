"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  Sparkles,
  FileDown,
  Trash2,
  Plus,
  ChevronDown,
  Scale,
  BookOpenCheck,
  Landmark,
  Percent,
  ListChecks,
} from "lucide-react";
import { api, postJson, putJson, ApiError, mxn } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { TASAS_DEPRECIACION } from "@/lib/contabilidad/catalogo";
import type { Poliza, CuentaContable, ActivoFijo, ReglaContable, ConfigFiscal } from "@/lib/types";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const TABS = [
  { clave: "polizas", label: "Pólizas", icon: BookOpenCheck },
  { clave: "balanza", label: "Balanza", icon: Scale },
  { clave: "impuestos", label: "Impuestos", icon: Percent },
  { clave: "catalogo", label: "Catálogo", icon: ListChecks },
  { clave: "activos", label: "Activos", icon: Landmark },
] as const;

interface RenglonBalanza {
  cuenta: CuentaContable;
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
}

interface PanelFiscal {
  flujo: { ingresosCobrados: number; ivaCobrado: number; retencionesAcreditables: number; ivaAcreditablePagado: number; gastosSinXml: number };
  iva: { aCargo: number; aFavor: number };
  resico: null | { tasa: number; isrCausado: number; retenciones: number; isrAPagar: number; excedeLimite: boolean };
  pm: null | { ingresosNominales: number; coeficiente: number; utilidadEstimada: number; pagoProvisional: number };
}

const TIPO_POLIZA: Record<string, { label: string; color: "green" | "red" | "sky" }> = {
  ingresos: { label: "Ingresos", color: "green" },
  egresos: { label: "Egresos", color: "red" },
  diario: { label: "Diario", color: "sky" },
};

export default function ContabilidadPage() {
  const { toast } = useToast();
  const hoy = new Date();
  const [tab, setTab] = useState<string>("polizas");
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1).padStart(2, "0"));

  const [polizas, setPolizas] = useState<Poliza[] | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [balanza, setBalanza] = useState<{ renglones: RenglonBalanza[]; totalDebe: number; totalHaber: number; cuadrada: boolean } | null>(null);
  const [fiscal, setFiscal] = useState<{ panel: PanelFiscal; config: ConfigFiscal } | null>(null);
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [activos, setActivos] = useState<ActivoFijo[]>([]);
  const [reglas, setReglas] = useState<ReglaContable[]>([]);

  const [modalCuenta, setModalCuenta] = useState(false);
  const [formCuenta, setFormCuenta] = useState({ codigo: "", nombre: "", codigoAgrupador: "", naturaleza: "D" });
  const [modalActivo, setModalActivo] = useState(false);
  const [formActivo, setFormActivo] = useState({ descripcion: "", moi: "", fechaAdquisicion: hoy.toISOString().slice(0, 10), tasaAnual: "30" });
  const [modalRegla, setModalRegla] = useState(false);
  const [formRegla, setFormRegla] = useState({ criterio: "rfc", valor: "", cuentaCodigo: "", nota: "" });
  const [guardando, setGuardando] = useState(false);

  const periodo = `anio=${anio}&mes=${mes}`;

  const cargar = useCallback(async () => {
    try {
      const [p, b, f, c, a, r] = await Promise.all([
        api<Poliza[]>(`/api/contabilidad/polizas?${periodo}`),
        api<typeof balanza>(`/api/contabilidad/balanza?${periodo}`),
        api<typeof fiscal>(`/api/contabilidad/fiscal?${periodo}`),
        api<CuentaContable[]>("/api/contabilidad/cuentas"),
        api<ActivoFijo[]>("/api/contabilidad/activos"),
        api<ReglaContable[]>("/api/contabilidad/reglas"),
      ]);
      setPolizas(p);
      setBalanza(b);
      setFiscal(f);
      setCuentas(c);
      setActivos(a);
      setReglas(r);
    } catch (e) {
      toast("error", "Contabilidad", e instanceof ApiError ? e.message : String(e));
      setPolizas([]);
    }
  }, [periodo, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const generar = async (regenerar: boolean) => {
    setGenerando(true);
    try {
      const r = await postJson<{ creadas: number; omitidas: number; descuadradas: number }>(
        "/api/contabilidad/generar",
        { anio, mes, regenerar },
      );
      toast("success", `${r.creadas} póliza(s) generadas`, `${r.omitidas} ya existían${r.descuadradas ? ` · ${r.descuadradas} descuadradas omitidas` : ""}.`);
      await cargar();
    } catch (e) {
      toast("error", "No se pudo generar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGenerando(false);
    }
  };

  const eliminarPoliza = async (id: string) => {
    if (!confirm("¿Eliminar esta póliza?")) return;
    await api(`/api/contabilidad/polizas?id=${id}`, { method: "DELETE" });
    await cargar();
  };

  const guardarCuenta = async () => {
    setGuardando(true);
    try {
      await postJson("/api/contabilidad/cuentas", formCuenta);
      toast("success", "Cuenta guardada");
      setModalCuenta(false);
      await cargar();
    } catch (e) {
      toast("error", "Cuenta", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardarActivo = async () => {
    setGuardando(true);
    try {
      await postJson("/api/contabilidad/activos", { ...formActivo, moi: Number(formActivo.moi), tasaAnual: Number(formActivo.tasaAnual) });
      toast("success", "Activo registrado", "Su depreciación entrará en las pólizas de diario.");
      setModalActivo(false);
      await cargar();
    } catch (e) {
      toast("error", "Activo", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardarRegla = async () => {
    setGuardando(true);
    try {
      await postJson("/api/contabilidad/reglas", formRegla);
      toast("success", "Regla guardada", "Se aplicará al regenerar las pólizas del periodo.");
      setModalRegla(false);
      await cargar();
    } catch (e) {
      toast("error", "Regla", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardarFiscal = async (cfg: ConfigFiscal) => {
    try {
      await putJson("/api/contabilidad/fiscal", cfg);
      toast("success", "Régimen de cálculo guardado");
      await cargar();
    } catch (e) {
      toast("error", "Fiscal", e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Contabilidad"
        subtitle="Pólizas automáticas desde tus CFDI, balanza con exportación al SAT (Anexo 24), activos y panel de impuestos del mes."
        actions={
          <div className="flex items-center gap-2">
            <Select value={mes} onChange={(e) => setMes(e.target.value)} className="w-36 py-2 text-xs">
              {MESES.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
              ))}
            </Select>
            <Select value={anio} onChange={(e) => setAnio(e.target.value)} className="w-24 py-2 text-xs">
              {[0, 1, 2].map((d) => {
                const y = String(hoy.getFullYear() - d);
                return <option key={y} value={y}>{y}</option>;
              })}
            </Select>
          </div>
        }
      />

      {/* Pestañas */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.clave}
              onClick={() => setTab(t.clave)}
              className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${tab === t.clave ? "text-white" : "text-ink-600 hover:text-ink-900"}`}
            >
              {tab === t.clave && (
                <motion.span layoutId="conta-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 shadow" />
              )}
              <Icon className="relative z-10 size-3.5" />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {polizas === null ? (
        <Spinner label="Cargando contabilidad…" />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* ---------- PÓLIZAS ---------- */}
            {tab === "polizas" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Button onClick={() => generar(false)} loading={generando}>
                    <Sparkles className="size-4" /> Generar pólizas del periodo
                  </Button>
                  {polizas.length > 0 && (
                    <Button variant="secondary" onClick={() => generar(true)} loading={generando}>
                      Regenerar (reemplaza las automáticas)
                    </Button>
                  )}
                  <p className="text-xs text-ink-400">
                    Lee facturas emitidas, cobros REP y gastos de la bóveda de {MESES[Number(mes) - 1]} {anio}.
                  </p>
                </div>
                {polizas.length === 0 ? (
                  <EmptyState
                    icon={<Calculator className="size-7" />}
                    title="Sin pólizas en este periodo"
                    detail="Pulsa «Generar pólizas» y el motor contabilizará automáticamente los CFDI del mes: ingresos PUE/PPD, cobros, gastos (con reglas por proveedor) y depreciación."
                  />
                ) : (
                  <div className="space-y-2">
                    {polizas.map((p) => {
                      const t = TIPO_POLIZA[p.tipo];
                      const abiertaEsta = abierta === p.id;
                      return (
                        <div key={p.id} className="card overflow-hidden">
                          <button onClick={() => setAbierta(abiertaEsta ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                            <Badge color={t.color}>{t.label} #{p.numero}</Badge>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.concepto}</span>
                            <span className="text-xs text-ink-400">{p.fecha}</span>
                            <span className="tnum text-sm font-extrabold">{mxn.format(p.total)}</span>
                            <ChevronDown className={`size-4 text-ink-400 transition-transform ${abiertaEsta ? "rotate-180" : ""}`} />
                          </button>
                          {abiertaEsta && (
                            <div className="border-t border-slate-100 px-4 py-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-[10px] uppercase text-ink-400">
                                    <th className="pb-1.5">Cuenta</th>
                                    <th className="pb-1.5 text-right">Debe</th>
                                    <th className="pb-1.5 text-right">Haber</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.movimientos.map((m, i) => (
                                    <tr key={i} className="border-t border-slate-50">
                                      <td className="py-1.5"><span className="mono text-[10px] text-ink-400">{m.cuenta}</span> {m.nombreCuenta}</td>
                                      <td className="tnum py-1.5 text-right">{m.debe ? mxn.format(m.debe) : ""}</td>
                                      <td className="tnum py-1.5 text-right">{m.haber ? mxn.format(m.haber) : ""}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="mt-2 flex justify-end">
                                <button onClick={() => eliminarPoliza(p.id)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                                  <Trash2 className="size-3.5" /> Eliminar póliza
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---------- BALANZA ---------- */}
            {tab === "balanza" && balanza && (
              <div className="card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold">Balanza de comprobación · {MESES[Number(mes) - 1]} {anio}</h2>
                    <Badge color={balanza.cuadrada ? "green" : "red"}>{balanza.cuadrada ? "Cuadrada" : "¡Descuadrada!"}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <a href={`/api/contabilidad/exportar?tipo=catalogo&${periodo}`}>
                      <Button variant="secondary" className="px-3 py-2 text-xs"><FileDown className="size-3.5" /> Catálogo XML (SAT)</Button>
                    </a>
                    <a href={`/api/contabilidad/exportar?tipo=balanza&${periodo}`}>
                      <Button variant="secondary" className="px-3 py-2 text-xs"><FileDown className="size-3.5" /> Balanza XML (SAT)</Button>
                    </a>
                  </div>
                </div>
                {balanza.renglones.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">Sin movimientos en el periodo. Genera primero las pólizas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400">
                          <th className="py-2 pr-3">Cuenta</th>
                          <th className="py-2 pr-3 text-right">Saldo inicial</th>
                          <th className="py-2 pr-3 text-right">Debe</th>
                          <th className="py-2 pr-3 text-right">Haber</th>
                          <th className="py-2 text-right">Saldo final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanza.renglones.map((r) => (
                          <tr key={r.cuenta.codigo} className="border-b border-slate-50">
                            <td className="py-2 pr-3"><span className="mono text-[10px] text-ink-400">{r.cuenta.codigo}</span> {r.cuenta.nombre}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(r.saldoInicial)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(r.debe)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(r.haber)}</td>
                            <td className="tnum py-2 text-right font-bold">{mxn.format(r.saldoFinal)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-slate-300 font-extrabold">
                          <td className="py-2 pr-3">Sumas</td>
                          <td />
                          <td className="tnum py-2 pr-3 text-right">{mxn.format(balanza.totalDebe)}</td>
                          <td className="tnum py-2 pr-3 text-right">{mxn.format(balanza.totalHaber)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ---------- IMPUESTOS ---------- */}
            {tab === "impuestos" && fiscal && (
              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="mb-3 text-sm font-bold">Régimen para el cálculo de ISR</h2>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Régimen de esta empresa">
                      <Select
                        value={fiscal.config.regimenCalculo}
                        onChange={(e) => guardarFiscal({ ...fiscal.config, regimenCalculo: e.target.value as ConfigFiscal["regimenCalculo"] })}
                        className="w-72"
                      >
                        <option value="ninguno">Sin cálculo automático</option>
                        <option value="resico_pf">RESICO · Persona Física (Art. 113-E)</option>
                        <option value="pm_general">Régimen General PM (coeficiente de utilidad)</option>
                      </Select>
                    </Field>
                    {fiscal.config.regimenCalculo === "pm_general" && (
                      <Field label="Coeficiente de utilidad" hint="De tu última declaración anual, ej. 0.0854">
                        <Input
                          type="number" step="0.0001" min="0" max="1"
                          defaultValue={fiscal.config.coeficienteUtilidad || ""}
                          onBlur={(e) => guardarFiscal({ ...fiscal.config, coeficienteUtilidad: Number(e.target.value) || 0 })}
                          className="tnum w-36"
                        />
                      </Field>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="card p-5">
                    <h3 className="mb-3 text-sm font-bold">IVA del mes (flujo)</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between"><dt className="text-ink-600">IVA cobrado</dt><dd className="tnum font-bold">{mxn.format(fiscal.panel.flujo.ivaCobrado)}</dd></div>
                      <div className="flex justify-between"><dt className="text-ink-600">IVA acreditable pagado</dt><dd className="tnum font-bold text-emerald-700">−{mxn.format(fiscal.panel.flujo.ivaAcreditablePagado)}</dd></div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                        <dt className="font-extrabold">{fiscal.panel.iva.aCargo > 0 ? "IVA a cargo" : "IVA a favor"}</dt>
                        <dd className={`tnum font-extrabold ${fiscal.panel.iva.aCargo > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                          {mxn.format(fiscal.panel.iva.aCargo > 0 ? fiscal.panel.iva.aCargo : fiscal.panel.iva.aFavor)}
                        </dd>
                      </div>
                    </dl>
                    {fiscal.panel.flujo.gastosSinXml > 0 && (
                      <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                        {fiscal.panel.flujo.gastosSinXml} gasto(s) solo tienen metadata (sin XML): su IVA no se pudo acreditar aquí.
                      </p>
                    )}
                  </div>

                  <div className="card p-5">
                    <h3 className="mb-3 text-sm font-bold">
                      {fiscal.panel.resico ? "ISR RESICO (flujo del mes)" : fiscal.panel.pm ? "Pago provisional ISR (PM)" : "ISR"}
                    </h3>
                    {fiscal.panel.resico ? (
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-ink-600">Ingresos cobrados (sin IVA)</dt><dd className="tnum font-bold">{mxn.format(fiscal.panel.flujo.ingresosCobrados)}</dd></div>
                        <div className="flex justify-between"><dt className="text-ink-600">Tasa aplicable</dt><dd className="tnum font-bold">{(fiscal.panel.resico.tasa * 100).toFixed(2)}%</dd></div>
                        <div className="flex justify-between"><dt className="text-ink-600">ISR causado</dt><dd className="tnum font-bold">{mxn.format(fiscal.panel.resico.isrCausado)}</dd></div>
                        <div className="flex justify-between"><dt className="text-ink-600">Retenciones (1.25% PM)</dt><dd className="tnum font-bold text-emerald-700">−{mxn.format(fiscal.panel.resico.retenciones)}</dd></div>
                        <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-extrabold">ISR estimado a pagar</dt><dd className="tnum font-extrabold text-rose-600">{mxn.format(fiscal.panel.resico.isrAPagar)}</dd></div>
                        {fiscal.panel.resico.excedeLimite && (
                          <p className="rounded-lg bg-rose-50 p-2 text-[11px] font-semibold text-rose-700">
                            ⚠ Los ingresos del mes exceden el límite RESICO ($3.5M): revisa con tu contador.
                          </p>
                        )}
                      </dl>
                    ) : fiscal.panel.pm ? (
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between"><dt className="text-ink-600">Ingresos nominales</dt><dd className="tnum font-bold">{mxn.format(fiscal.panel.pm.ingresosNominales)}</dd></div>
                        <div className="flex justify-between"><dt className="text-ink-600">× Coeficiente de utilidad</dt><dd className="tnum font-bold">{fiscal.panel.pm.coeficiente}</dd></div>
                        <div className="flex justify-between"><dt className="text-ink-600">Utilidad estimada</dt><dd className="tnum font-bold">{mxn.format(fiscal.panel.pm.utilidadEstimada)}</dd></div>
                        <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-extrabold">Pago provisional (30%)</dt><dd className="tnum font-extrabold text-rose-600">{mxn.format(fiscal.panel.pm.pagoProvisional)}</dd></div>
                      </dl>
                    ) : (
                      <p className="py-6 text-center text-sm text-ink-400">Selecciona el régimen de cálculo arriba para ver la estimación del mes.</p>
                    )}
                    <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
                      Estimación informativa para planeación: la declaración definitiva puede variar (deducciones, acumulados, actualizaciones). Revísala con tu contador.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- CATÁLOGO ---------- */}
            {tab === "catalogo" && (
              <div className="space-y-4">
                <div className="card p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold">Catálogo de cuentas ({cuentas.length})</h2>
                    <Button onClick={() => { setFormCuenta({ codigo: "", nombre: "", codigoAgrupador: "", naturaleza: "D" }); setModalCuenta(true); }} className="px-3 py-2 text-xs">
                      <Plus className="size-3.5" /> Nueva cuenta
                    </Button>
                  </div>
                  <p className="mb-3 rounded-lg bg-sky-50 p-2.5 text-[11px] leading-relaxed text-sky-900">
                    Catálogo inicial editable. <b>Revisa los códigos agrupadores con tu contador</b> antes de enviar la contabilidad electrónica al SAT.
                  </p>
                  <div className="grid gap-1.5 md:grid-cols-2">
                    {cuentas.map((c) => (
                      <div key={c.codigo} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        <span className="mono font-bold text-brand-700">{c.codigo}</span>
                        <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                        <Badge color="slate">Agr. {c.codigoAgrupador}</Badge>
                        <Badge color={c.naturaleza === "D" ? "sky" : "amber"}>{c.naturaleza}</Badge>
                        <button
                          onClick={() => { setFormCuenta({ codigo: c.codigo, nombre: c.nombre, codigoAgrupador: c.codigoAgrupador, naturaleza: c.naturaleza }); setModalCuenta(true); }}
                          className="text-[10px] font-bold text-brand-600 hover:underline"
                        >
                          editar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold">Reglas contables para gastos ({reglas.length})</h2>
                    <Button onClick={() => { setFormRegla({ criterio: "rfc", valor: "", cuentaCodigo: cuentas.find((c) => c.codigo.startsWith("601"))?.codigo ?? "", nota: "" }); setModalRegla(true); }} className="px-3 py-2 text-xs">
                      <Plus className="size-3.5" /> Nueva regla
                    </Button>
                  </div>
                  <p className="mb-3 text-xs text-ink-400">
                    Dirige los CFDI de un proveedor (por RFC) o de una clave de producto (por prefijo) a una cuenta de gasto específica. Sin regla, van a Gastos generales.
                  </p>
                  {reglas.length === 0 ? (
                    <p className="py-4 text-center text-xs text-ink-400">Sin reglas: todos los gastos van a la cuenta general.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {reglas.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                          <Badge color="brand">{r.criterio === "rfc" ? "RFC" : "Clave"}</Badge>
                          <span className="mono font-bold">{r.valor}</span>
                          <span className="text-ink-400">→</span>
                          <span className="mono">{r.cuentaCodigo}</span>
                          <span className="min-w-0 flex-1 truncate text-ink-400">{r.nota}</span>
                          <button onClick={async () => { await api(`/api/contabilidad/reglas?id=${r.id}`, { method: "DELETE" }); await cargar(); }} className="text-rose-500 hover:text-rose-700">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---------- ACTIVOS ---------- */}
            {tab === "activos" && (
              <div className="card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold">Activos fijos ({activos.length})</h2>
                  <Button onClick={() => setModalActivo(true)} className="px-3 py-2 text-xs">
                    <Plus className="size-3.5" /> Registrar activo
                  </Button>
                </div>
                {activos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">
                    Registra tus activos (equipo, vehículos, mobiliario…) y su depreciación mensual se contabilizará sola en las pólizas de diario.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400">
                          <th className="py-2 pr-3">Activo</th>
                          <th className="py-2 pr-3 text-right">MOI</th>
                          <th className="py-2 pr-3 text-right">Tasa anual</th>
                          <th className="py-2 pr-3 text-right">Dep. mensual</th>
                          <th className="py-2 pr-3">Adquisición</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {activos.map((a) => (
                          <tr key={a.id} className="border-b border-slate-50">
                            <td className="py-2 pr-3 font-semibold">{a.descripcion}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(a.moi)}</td>
                            <td className="tnum py-2 pr-3 text-right">{a.tasaAnual}%</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format((a.moi * a.tasaAnual) / 100 / 12)}</td>
                            <td className="py-2 pr-3">{a.fechaAdquisicion}</td>
                            <td className="py-2 text-right">
                              <button onClick={async () => { if (confirm("¿Eliminar activo?")) { await api(`/api/contabilidad/activos?id=${a.id}`, { method: "DELETE" }); await cargar(); } }} className="text-rose-500 hover:text-rose-700">
                                <Trash2 className="size-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Modal cuenta */}
      <Modal open={modalCuenta} onClose={() => setModalCuenta(false)} title={formCuenta.codigo ? `Cuenta ${formCuenta.codigo}` : "Nueva cuenta"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código (tuyo)"><Input value={formCuenta.codigo} onChange={(e) => setFormCuenta({ ...formCuenta, codigo: e.target.value })} placeholder="601.04" className="mono" /></Field>
            <Field label="Código agrupador SAT"><Input value={formCuenta.codigoAgrupador} onChange={(e) => setFormCuenta({ ...formCuenta, codigoAgrupador: e.target.value })} placeholder="601.84" className="mono" /></Field>
          </div>
          <Field label="Nombre"><Input value={formCuenta.nombre} onChange={(e) => setFormCuenta({ ...formCuenta, nombre: e.target.value })} placeholder="Publicidad y propaganda" /></Field>
          <Field label="Naturaleza">
            <Select value={formCuenta.naturaleza} onChange={(e) => setFormCuenta({ ...formCuenta, naturaleza: e.target.value })}>
              <option value="D">Deudora (activo / gasto)</option>
              <option value="A">Acreedora (pasivo / capital / ingreso)</option>
            </Select>
          </Field>
          <Button onClick={guardarCuenta} loading={guardando} className="w-full">Guardar cuenta</Button>
        </div>
      </Modal>

      {/* Modal activo */}
      <Modal open={modalActivo} onClose={() => setModalActivo(false)} title="Registrar activo fijo">
        <div className="space-y-4">
          <Field label="Descripción"><Input value={formActivo.descripcion} onChange={(e) => setFormActivo({ ...formActivo, descripcion: e.target.value })} placeholder="Laptop Dell Latitude" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto original (sin IVA)"><Input type="number" min="0" step="0.01" value={formActivo.moi} onChange={(e) => setFormActivo({ ...formActivo, moi: e.target.value })} className="tnum" placeholder="25000" /></Field>
            <Field label="Fecha de adquisición"><Input type="date" value={formActivo.fechaAdquisicion} onChange={(e) => setFormActivo({ ...formActivo, fechaAdquisicion: e.target.value })} /></Field>
          </div>
          <Field label="Tasa de depreciación (LISR)">
            <Select value={formActivo.tasaAnual} onChange={(e) => setFormActivo({ ...formActivo, tasaAnual: e.target.value })}>
              {TASAS_DEPRECIACION.map((t) => (
                <option key={t.etiqueta} value={t.tasa}>{t.etiqueta}</option>
              ))}
            </Select>
          </Field>
          <Button onClick={guardarActivo} loading={guardando} className="w-full">Registrar activo</Button>
        </div>
      </Modal>

      {/* Modal regla */}
      <Modal open={modalRegla} onClose={() => setModalRegla(false)} title="Nueva regla contable" subtitle="Se aplica a los gastos al generar pólizas.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Criterio">
              <Select value={formRegla.criterio} onChange={(e) => setFormRegla({ ...formRegla, criterio: e.target.value })}>
                <option value="rfc">RFC del proveedor</option>
                <option value="claveProdServ">Clave producto/servicio (prefijo)</option>
              </Select>
            </Field>
            <Field label={formRegla.criterio === "rfc" ? "RFC" : "Prefijo de clave"}>
              <Input value={formRegla.valor} onChange={(e) => setFormRegla({ ...formRegla, valor: e.target.value.toUpperCase() })} placeholder={formRegla.criterio === "rfc" ? "EKU9003173C9" : "8111"} className="mono" />
            </Field>
          </div>
          <Field label="Cuenta destino">
            <Select value={formRegla.cuentaCodigo} onChange={(e) => setFormRegla({ ...formRegla, cuentaCodigo: e.target.value })}>
              <option value="">Selecciona…</option>
              {cuentas.filter((c) => c.naturaleza === "D").map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nota (opcional)"><Input value={formRegla.nota} onChange={(e) => setFormRegla({ ...formRegla, nota: e.target.value })} placeholder="Renta de oficina" /></Field>
          <Button onClick={guardarRegla} loading={guardando} className="w-full">Guardar regla</Button>
        </div>
      </Modal>
    </div>
  );
}
