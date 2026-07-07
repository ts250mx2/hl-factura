"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UsersRound, Plus, Trash2, BadgeDollarSign, PlayCircle, Stamp, FileDown, Mail, Ban, Settings2, FileSpreadsheet, Search } from "lucide-react";
import { api, postJson, putJson, ApiError, mxn, fechaCorta } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { FiltroPeriodo, usePeriodo } from "@/components/filtro-periodo";
import {
  PERIODICIDADES_PAGO,
  TIPOS_CONTRATO,
  TIPOS_REGIMEN,
  RIESGOS_PUESTO,
  ENTIDADES_FEDERATIVAS,
  TIPOS_INCAPACIDAD,
} from "@/lib/nomina/catalogos";
import type { Empleado, IncidenciasEmpleado, CalculoRecibo, ReciboNomina, ConfigNomina } from "@/lib/nomina/tipos";

const TABS = [
  { clave: "empleados", label: "Empleados", icon: UsersRound },
  { clave: "corrida", label: "Calcular y timbrar", icon: PlayCircle },
  { clave: "recibos", label: "Recibos", icon: Stamp },
  { clave: "config", label: "Configuración", icon: Settings2 },
] as const;

const INC_VACIA: IncidenciasEmpleado = {
  faltas: 0, horasExtraDobles: 0, diasIncapacidad: 0, tipoIncapacidad: "02",
  diasVacaciones: 0, pagarPrimaVacacional: false, diasAguinaldo: 0, bono: 0, otrasDeducciones: 0,
};

const FORM_EMP_VACIO = {
  id: "", numEmpleado: "", nombre: "", rfc: "", curp: "", nss: "", codigoPostal: "", email: "",
  fechaInicioLaboral: "", tipoContrato: "01", tipoRegimen: "02", periodicidadPago: "04",
  riesgoPuesto: "1", departamento: "", puesto: "", salarioDiario: "",
};

export default function NominaPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<string>("empleados");
  const [busqueda, setBusqueda] = useState("");
  const periodoCtrl = usePeriodo(); // recibos: default este mes (fecha de pago)
  const [empleados, setEmpleados] = useState<Empleado[] | null>(null);
  const [recibos, setRecibos] = useState<ReciboNomina[]>([]);
  const [config, setConfig] = useState<ConfigNomina | null>(null);

  const [modalEmp, setModalEmp] = useState(false);
  const [formEmp, setFormEmp] = useState(FORM_EMP_VACIO);
  const [guardando, setGuardando] = useState(false);

  // Corrida
  const hoy = new Date();
  const quincena = hoy.getDate() <= 15;
  const defInicio = new Date(hoy.getFullYear(), hoy.getMonth(), quincena ? 1 : 16).toISOString().slice(0, 10);
  const defFin = quincena
    ? new Date(hoy.getFullYear(), hoy.getMonth(), 15).toISOString().slice(0, 10)
    : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [periodoInicio, setPeriodoInicio] = useState(defInicio);
  const [periodoFin, setPeriodoFin] = useState(defFin);
  const [seleccion, setSeleccion] = useState<Record<string, IncidenciasEmpleado>>({});
  const [preview, setPreview] = useState<{ empleadoId: string; nombre: string; calculo: CalculoRecibo }[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [incidenciasDe, setIncidenciasDe] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [e, r, c] = await Promise.all([
        api<Empleado[]>("/api/nomina/empleados"),
        api<ReciboNomina[]>("/api/nomina/recibos"),
        api<ConfigNomina>("/api/nomina/config"),
      ]);
      setEmpleados(e);
      setRecibos(r);
      setConfig(c);
      setSeleccion((s) => {
        const nuevo: Record<string, IncidenciasEmpleado> = {};
        for (const emp of e.filter((x) => x.activo)) nuevo[emp.id] = s[emp.id] ?? { ...INC_VACIA };
        return nuevo;
      });
    } catch (err) {
      toast("error", "Nómina", err instanceof ApiError ? err.message : String(err));
      setEmpleados([]);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarEmpleado = async () => {
    setGuardando(true);
    try {
      await postJson("/api/nomina/empleados", { ...formEmp, salarioDiario: Number(formEmp.salarioDiario) });
      toast("success", "Empleado guardado");
      setModalEmp(false);
      await cargar();
    } catch (e) {
      toast("error", "Empleado", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const itemsCorrida = () =>
    Object.entries(seleccion).map(([empleadoId, incidencias]) => ({ empleadoId, incidencias }));

  const calcular = async () => {
    setTrabajando(true);
    setPreview(null);
    try {
      const r = await postJson<{ resultados: typeof preview }>("/api/nomina/calcular", {
        periodoInicio, periodoFin, fechaPago: periodoFin, items: itemsCorrida(),
      });
      setPreview(r.resultados);
    } catch (e) {
      toast("error", "Cálculo", e instanceof ApiError ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  };

  const timbrarTodo = async () => {
    if (!confirm(`¿Timbrar la nómina del ${periodoInicio} al ${periodoFin} para ${Object.keys(seleccion).length} empleado(s)?`)) return;
    setTrabajando(true);
    try {
      const r = await postJson<{ timbrados: number; omitidos: number; errores: { empleado: string; error: string }[] }>(
        "/api/nomina/timbrar",
        { periodoInicio, periodoFin, fechaPago: periodoFin, items: itemsCorrida() },
      );
      toast("success", `${r.timbrados} recibo(s) timbrados`, r.omitidos ? `${r.omitidos} ya estaban timbrados.` : undefined);
      for (const err of r.errores) toast("error", err.empleado, err.error);
      setPreview(null);
      setTab("recibos");
      await cargar();
    } catch (e) {
      toast("error", "Timbrado", e instanceof ApiError ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  };

  const enviarPeriodo = async (periodo: string) => {
    const ids = recibos.filter((r) => r.periodoInicio === periodo && r.estado === "timbrada").map((r) => r.id);
    setTrabajando(true);
    try {
      const r = await postJson<{ enviados: number; sinCorreo: number; errores: string[] }>("/api/nomina/enviar", { reciboIds: ids });
      toast("success", `${r.enviados} recibo(s) enviados por correo`, r.sinCorreo ? `${r.sinCorreo} trabajador(es) sin correo registrado.` : undefined);
      for (const err of r.errores) toast("error", "Envío", err);
      await cargar();
    } catch (e) {
      toast("error", "Envío", e instanceof ApiError ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  };

  const cancelarRecibo = async (r: ReciboNomina) => {
    if (!confirm(`¿Cancelar el recibo de ${r.empleadoNombre}?`)) return;
    try {
      await postJson(`/api/nomina/recibos/${r.id}/cancelar`, {});
      toast("success", "Recibo cancelado");
      await cargar();
    } catch (e) {
      toast("error", "Cancelación", e instanceof ApiError ? e.message : String(e));
    }
  };

  const totalesPreview = preview
    ? {
        percepciones: preview.reduce((s, p) => s + p.calculo.totalPercepciones, 0),
        isr: preview.reduce((s, p) => s + p.calculo.isr.retenido, 0),
        imss: preview.reduce((s, p) => s + p.calculo.imssObrero, 0),
        neto: preview.reduce((s, p) => s + p.calculo.neto, 0),
        patronal: preview.reduce((s, p) => s + p.calculo.costoPatronal.total, 0),
      }
    : null;

  // Búsqueda: filtra empleados (nombre, RFC, NSS, No.), la corrida y los recibos.
  const q = busqueda.trim().toLowerCase();
  const coincide = (e: Empleado) =>
    !q || e.nombre.toLowerCase().includes(q) || e.rfc.toLowerCase().includes(q) || e.numEmpleado.toLowerCase().includes(q) || e.nss.includes(q);
  const empleadosFiltrados = (empleados ?? []).filter(coincide);
  const enCorrida = (empleados ?? []).filter((e) => e.activo && seleccion[e.id] && coincide(e));
  const recibosFiltrados = recibos.filter(
    (r) => (!q || r.empleadoNombre.toLowerCase().includes(q)) && periodoCtrl.enPeriodo(r.fechaPago),
  );
  const periodosRecibos = [...new Set(recibosFiltrados.map((r) => r.periodoInicio))];

  return (
    <div>
      <PageHeader
        title="Nómina"
        subtitle="Empleados, cálculo laboral (ISR, subsidio, IMSS), incidencias y timbrado masivo de CFDI de nómina 1.2."
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.clave}
              onClick={() => setTab(t.clave)}
              className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${tab === t.clave ? "text-white" : "text-ink-600 hover:text-ink-900"}`}
            >
              {tab === t.clave && <motion.span layoutId="nom-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 shadow" />}
              <Icon className="relative z-10 size-3.5" />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab !== "config" && empleados !== null && (empleados.length > 0 || tab === "empleados") && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {empleados.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre, RFC, NSS o No. de empleado…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </motion.div>
          )}
          {tab === "recibos" && <FiltroPeriodo ctrl={periodoCtrl} />}
          {tab === "empleados" && (
            <Button onClick={() => { setFormEmp(FORM_EMP_VACIO); setModalEmp(true); }} className="ml-auto">
              <Plus className="size-4" /> Nuevo empleado
            </Button>
          )}
        </div>
      )}

      {empleados === null ? (
        <Spinner label="Cargando nómina…" />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* ---------- EMPLEADOS ---------- */}
            {tab === "empleados" && (
              <div>
                {empleados.length === 0 ? (
                  <EmptyState
                    icon={<UsersRound className="size-7" />}
                    title="Sin empleados"
                    detail="Da de alta a tus trabajadores con sus datos SAT (RFC, CURP) e IMSS (NSS, salario). El SDI y el SBC se calculan solos."
                    action={<Button onClick={() => { setFormEmp(FORM_EMP_VACIO); setModalEmp(true); }}><Plus className="size-4" /> Nuevo empleado</Button>}
                  />
                ) : empleadosFiltrados.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">Ningún empleado coincide con «{busqueda}».</p>
                ) : (
                  <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100">
                    {empleadosFiltrados.map((e) => (
                      <motion.div key={e.id} variants={listItem} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-extrabold text-white">
                          {e.nombre.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{e.nombre} {e.origen === "descarga" && <Badge color="sky">Del SAT</Badge>} {!e.activo && <Badge color="red">Baja</Badge>}</p>
                          <p className="mono text-[11px] text-ink-400">{e.rfc} · NSS {e.nss || "—"} · #{e.numEmpleado}</p>
                        </div>
                        <div className="hidden text-right text-xs sm:block">
                          <p className="tnum font-bold">{mxn.format(e.salarioDiario)}/día</p>
                          <p className="text-ink-400">{PERIODICIDADES_PAGO.find((p) => p.clave === e.periodicidadPago)?.descripcion}</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => { setFormEmp({ ...FORM_EMP_VACIO, ...e, salarioDiario: String(e.salarioDiario), email: e.email ?? "", departamento: e.departamento ?? "", puesto: e.puesto ?? "" }); setModalEmp(true); }}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                          >
                            Editar
                          </button>
                          <button
                            onClick={async () => { await putJson(`/api/nomina/empleados/${e.id}`, { activo: !e.activo }); await cargar(); }}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${e.activo ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                          >
                            {e.activo ? "Dar de baja" : "Reactivar"}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            )}

            {/* ---------- CORRIDA ---------- */}
            {tab === "corrida" && (
              <div className="space-y-4">
                <div className="card flex flex-wrap items-end gap-3 p-5">
                  <Field label="Del">
                    <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                  </Field>
                  <Field label="Al (fecha de pago)">
                    <Input type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} />
                  </Field>
                  <Button variant="secondary" onClick={calcular} loading={trabajando}>
                    <BadgeDollarSign className="size-4" /> Calcular (vista previa)
                  </Button>
                  <Button onClick={timbrarTodo} loading={trabajando} disabled={Object.keys(seleccion).length === 0}>
                    <Stamp className="size-4" /> Timbrar nómina
                  </Button>
                </div>

                {Object.keys(seleccion).length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">No hay empleados activos. Dales de alta en la pestaña Empleados.</p>
                ) : (
                  <div className="card divide-y divide-slate-100">
                    {enCorrida.length === 0 && (
                      <p className="px-5 py-8 text-center text-sm text-ink-400">Ningún empleado de la corrida coincide con «{busqueda}».</p>
                    )}
                    {enCorrida.map((e) => {
                      const inc = seleccion[e.id];
                      const tieneIncidencias = inc.faltas > 0 || inc.horasExtraDobles > 0 || inc.diasIncapacidad > 0 || inc.diasAguinaldo > 0 || inc.bono > 0 || inc.otrasDeducciones > 0 || inc.pagarPrimaVacacional;
                      const calc = preview?.find((p) => p.empleadoId === e.id)?.calculo;
                      return (
                        <div key={e.id} className="px-5 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="min-w-0 flex-1 truncate text-sm font-bold">{e.nombre}</p>
                            {tieneIncidencias && <Badge color="amber">Con incidencias</Badge>}
                            {calc && (
                              <div className="flex gap-4 text-xs">
                                <span>Percep. <b className="tnum">{mxn.format(calc.totalPercepciones)}</b></span>
                                <span>ISR <b className="tnum text-rose-600">−{mxn.format(calc.isr.retenido)}</b></span>
                                <span>IMSS <b className="tnum text-rose-600">−{mxn.format(calc.imssObrero)}</b></span>
                                <span>Neto <b className="tnum text-emerald-700">{mxn.format(calc.neto)}</b></span>
                              </div>
                            )}
                            <button onClick={() => setIncidenciasDe(e.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                              Incidencias
                            </button>
                            <button
                              onClick={() => setSeleccion((s) => { const n = { ...s }; delete n[e.id]; return n; })}
                              className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Excluir de esta corrida"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {totalesPreview && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card grid grid-cols-2 gap-4 p-5 md:grid-cols-5">
                    <div><p className="text-xs text-ink-400">Percepciones</p><p className="tnum text-lg font-extrabold">{mxn.format(totalesPreview.percepciones)}</p></div>
                    <div><p className="text-xs text-ink-400">ISR retenido</p><p className="tnum text-lg font-extrabold text-rose-600">{mxn.format(totalesPreview.isr)}</p></div>
                    <div><p className="text-xs text-ink-400">IMSS obrero</p><p className="tnum text-lg font-extrabold text-rose-600">{mxn.format(totalesPreview.imss)}</p></div>
                    <div><p className="text-xs text-ink-400">Neto a depositar</p><p className="tnum text-lg font-extrabold text-emerald-700">{mxn.format(totalesPreview.neto)}</p></div>
                    <div><p className="text-xs text-ink-400">Costo patronal (IMSS+INFONAVIT)</p><p className="tnum text-lg font-extrabold">{mxn.format(totalesPreview.patronal)}</p></div>
                  </motion.div>
                )}
              </div>
            )}

            {/* ---------- RECIBOS ---------- */}
            {tab === "recibos" && (
              <div>
                {recibos.length === 0 ? (
                  <EmptyState icon={<Stamp className="size-7" />} title="Sin recibos" detail="Timbra tu primera corrida en la pestaña «Calcular y timbrar»." />
                ) : recibosFiltrados.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-ink-400">
                      {q ? `Ningún recibo coincide con «${busqueda}» en el periodo elegido.` : "Sin recibos en el periodo elegido."}
                    </p>
                    {(periodoCtrl.desde || periodoCtrl.hasta) && (
                      <button onClick={() => periodoCtrl.aplicar("")} className="mt-2 text-xs font-semibold text-brand-600 hover:underline">
                        Ver cualquier fecha
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {periodosRecibos.map((periodo) => {
                      const delPeriodo = recibosFiltrados.filter((r) => r.periodoInicio === periodo);
                      return (
                        <div key={periodo} className="card overflow-hidden">
                          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                            <p className="text-sm font-bold">Periodo {periodo} — {delPeriodo[0]?.periodoFin}</p>
                            <Badge color="slate">{delPeriodo.length} recibo(s)</Badge>
                            <div className="ml-auto flex gap-2">
                              <a href={`/api/nomina/exportar?periodoInicio=${periodo}`}>
                                <Button variant="secondary" className="px-3 py-1.5 text-xs"><FileSpreadsheet className="size-3.5" /> CSV SUA/IDSE</Button>
                              </a>
                              <Button variant="secondary" onClick={() => enviarPeriodo(periodo)} loading={trabajando} className="px-3 py-1.5 text-xs">
                                <Mail className="size-3.5" /> Enviar por correo
                              </Button>
                            </div>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {delPeriodo.map((r) => (
                              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{r.empleadoNombre}</p>
                                {r.estado === "timbrada" ? <Badge color="green">Timbrado</Badge> : r.estado === "cancelada" ? <Badge color="red">Cancelado</Badge> : <Badge color="amber">Error</Badge>}
                                {r.origen === "descarga" && <Badge color="sky">Del SAT</Badge>}
                                {r.demo && <Badge color="amber">DEMO</Badge>}
                                {r.enviadoEl && <Badge color="sky">Enviado</Badge>}
                                <span className="tnum w-24 text-right text-sm font-extrabold">{mxn.format(r.calculo.neto)}</span>
                                <div className="flex shrink-0 gap-1">
                                  {r.xmlPath && (
                                    <a href={`/api/nomina/recibos/${r.id}/xml`} className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="XML">
                                      <FileDown className="size-4" />
                                    </a>
                                  )}
                                  {r.estado === "timbrada" && r.origen !== "descarga" && (
                                    <button onClick={() => cancelarRecibo(r)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" title="Cancelar">
                                      <Ban className="size-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---------- CONFIG ---------- */}
            {tab === "config" && config && (
              <div className="card max-w-2xl space-y-4 p-5">
                <p className="text-sm font-bold">Datos patronales y parámetros del año</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Registro patronal IMSS">
                    <Input value={config.registroPatronal} onChange={(e) => setConfig({ ...config, registroPatronal: e.target.value.toUpperCase() })} placeholder="B5510768108" className="mono" />
                  </Field>
                  <Field label="Entidad federativa (donde laboran)">
                    <Select value={config.claveEntFed} onChange={(e) => setConfig({ ...config, claveEntFed: e.target.value })}>
                      {ENTIDADES_FEDERATIVAS.map((x) => <option key={x.clave} value={x.clave}>{x.descripcion}</option>)}
                    </Select>
                  </Field>
                  <Field label="Prima de riesgo de trabajo (%)">
                    <Input type="number" step="0.00001" value={config.primaRiesgo} onChange={(e) => setConfig({ ...config, primaRiesgo: Number(e.target.value) })} className="tnum" />
                  </Field>
                  <Field label="UMA diaria vigente">
                    <Input type="number" step="0.01" value={config.uma} onChange={(e) => setConfig({ ...config, uma: Number(e.target.value) })} className="tnum" />
                  </Field>
                  <Field label="Subsidio al empleo mensual">
                    <Input type="number" step="0.01" value={config.subsidioMensual} onChange={(e) => setConfig({ ...config, subsidioMensual: Number(e.target.value) })} className="tnum" />
                  </Field>
                  <Field label="Tope de ingresos para subsidio">
                    <Input type="number" step="0.01" value={config.subsidioTopeIngresos} onChange={(e) => setConfig({ ...config, subsidioTopeIngresos: Number(e.target.value) })} className="tnum" />
                  </Field>
                </div>
                <p className="rounded-lg bg-sky-50 p-2.5 text-[11px] leading-relaxed text-sky-900">
                  Los valores por defecto son de 2025. Actualiza UMA, subsidio y salario mínimo cuando se publiquen los del año en curso.
                </p>
                <Button
                  loading={guardando}
                  onClick={async () => {
                    setGuardando(true);
                    try {
                      await putJson("/api/nomina/config", config);
                      toast("success", "Configuración de nómina guardada");
                    } catch (e) {
                      toast("error", "Config", e instanceof ApiError ? e.message : String(e));
                    } finally {
                      setGuardando(false);
                    }
                  }}
                >
                  Guardar configuración
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Modal empleado */}
      <Modal open={modalEmp} onClose={() => setModalEmp(false)} title={formEmp.id ? "Editar empleado" : "Nuevo empleado"} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo" className="sm:col-span-2">
            <Input value={formEmp.nombre} onChange={(e) => setFormEmp({ ...formEmp, nombre: e.target.value.toUpperCase() })} placeholder="JUAN PEREZ LOPEZ" />
          </Field>
          <Field label="RFC (13)"><Input value={formEmp.rfc} onChange={(e) => setFormEmp({ ...formEmp, rfc: e.target.value.toUpperCase() })} maxLength={13} className="mono" /></Field>
          <Field label="CURP"><Input value={formEmp.curp} onChange={(e) => setFormEmp({ ...formEmp, curp: e.target.value.toUpperCase() })} maxLength={18} className="mono" /></Field>
          <Field label="NSS (11 dígitos)"><Input value={formEmp.nss} onChange={(e) => setFormEmp({ ...formEmp, nss: e.target.value.replace(/\D/g, "").slice(0, 11) })} className="mono" /></Field>
          <Field label="CP fiscal (CSF)"><Input value={formEmp.codigoPostal} onChange={(e) => setFormEmp({ ...formEmp, codigoPostal: e.target.value.replace(/\D/g, "").slice(0, 5) })} className="tnum" /></Field>
          <Field label="Salario diario"><Input type="number" min="0" step="0.01" value={formEmp.salarioDiario} onChange={(e) => setFormEmp({ ...formEmp, salarioDiario: e.target.value })} className="tnum" /></Field>
          <Field label="Inicio de relación laboral"><Input type="date" value={formEmp.fechaInicioLaboral} onChange={(e) => setFormEmp({ ...formEmp, fechaInicioLaboral: e.target.value })} /></Field>
          <Field label="Periodicidad de pago">
            <Select value={formEmp.periodicidadPago} onChange={(e) => setFormEmp({ ...formEmp, periodicidadPago: e.target.value })}>
              {PERIODICIDADES_PAGO.map((p) => <option key={p.clave} value={p.clave}>{p.descripcion}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de contrato">
            <Select value={formEmp.tipoContrato} onChange={(e) => setFormEmp({ ...formEmp, tipoContrato: e.target.value })}>
              {TIPOS_CONTRATO.map((t) => <option key={t.clave} value={t.clave}>{t.clave} · {t.descripcion}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de régimen">
            <Select value={formEmp.tipoRegimen} onChange={(e) => setFormEmp({ ...formEmp, tipoRegimen: e.target.value })}>
              {TIPOS_REGIMEN.map((t) => <option key={t.clave} value={t.clave}>{t.clave} · {t.descripcion}</option>)}
            </Select>
          </Field>
          <Field label="Riesgo del puesto">
            <Select value={formEmp.riesgoPuesto} onChange={(e) => setFormEmp({ ...formEmp, riesgoPuesto: e.target.value })}>
              {RIESGOS_PUESTO.map((t) => <option key={t.clave} value={t.clave}>{t.descripcion}</option>)}
            </Select>
          </Field>
          <Field label="No. empleado"><Input value={formEmp.numEmpleado} onChange={(e) => setFormEmp({ ...formEmp, numEmpleado: e.target.value })} placeholder="001" /></Field>
          <Field label="Departamento (opcional)"><Input value={formEmp.departamento} onChange={(e) => setFormEmp({ ...formEmp, departamento: e.target.value })} /></Field>
          <Field label="Puesto (opcional)"><Input value={formEmp.puesto} onChange={(e) => setFormEmp({ ...formEmp, puesto: e.target.value })} /></Field>
          <Field label="Correo (para enviarle sus recibos)" className="sm:col-span-2">
            <Input type="email" value={formEmp.email} onChange={(e) => setFormEmp({ ...formEmp, email: e.target.value })} placeholder="trabajador@correo.com" />
          </Field>
        </div>
        <Button onClick={guardarEmpleado} loading={guardando} className="mt-4 w-full">Guardar empleado</Button>
      </Modal>

      {/* Modal incidencias */}
      <Modal
        open={Boolean(incidenciasDe)}
        onClose={() => setIncidenciasDe(null)}
        title={`Incidencias · ${empleados?.find((e) => e.id === incidenciasDe)?.nombre ?? ""}`}
        subtitle="Se aplican solo a esta corrida."
      >
        {incidenciasDe && seleccion[incidenciasDe] && (
          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const inc = seleccion[incidenciasDe];
              const set = (patch: Partial<IncidenciasEmpleado>) =>
                setSeleccion((s) => ({ ...s, [incidenciasDe]: { ...s[incidenciasDe], ...patch } }));
              return (
                <>
                  <Field label="Faltas (días)"><Input type="number" min="0" value={inc.faltas} onChange={(e) => set({ faltas: Number(e.target.value) || 0 })} className="tnum" /></Field>
                  <Field label="Horas extra dobles"><Input type="number" min="0" value={inc.horasExtraDobles} onChange={(e) => set({ horasExtraDobles: Number(e.target.value) || 0 })} className="tnum" /></Field>
                  <Field label="Días de incapacidad"><Input type="number" min="0" value={inc.diasIncapacidad} onChange={(e) => set({ diasIncapacidad: Number(e.target.value) || 0 })} className="tnum" /></Field>
                  <Field label="Tipo de incapacidad">
                    <Select value={inc.tipoIncapacidad} onChange={(e) => set({ tipoIncapacidad: e.target.value })}>
                      {TIPOS_INCAPACIDAD.map((t) => <option key={t.clave} value={t.clave}>{t.descripcion}</option>)}
                    </Select>
                  </Field>
                  <Field label="Días de aguinaldo a pagar" hint="0 = no pagar en esta corrida.">
                    <Input type="number" min="0" value={inc.diasAguinaldo} onChange={(e) => set({ diasAguinaldo: Number(e.target.value) || 0 })} className="tnum" />
                  </Field>
                  <Field label="Días de vacaciones gozadas">
                    <Input type="number" min="0" value={inc.diasVacaciones} onChange={(e) => set({ diasVacaciones: Number(e.target.value) || 0 })} className="tnum" />
                  </Field>
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" checked={inc.pagarPrimaVacacional} onChange={(e) => set({ pagarPrimaVacacional: e.target.checked })} className="size-4 accent-brand-600" />
                    <span className="text-sm">Pagar prima vacacional (25%) sobre los días de vacaciones</span>
                  </div>
                  <Field label="Bono / comisión (gravado)"><Input type="number" min="0" step="0.01" value={inc.bono} onChange={(e) => set({ bono: Number(e.target.value) || 0 })} className="tnum" /></Field>
                  <Field label="Otras deducciones ($)"><Input type="number" min="0" step="0.01" value={inc.otrasDeducciones} onChange={(e) => set({ otrasDeducciones: Number(e.target.value) || 0 })} className="tnum" /></Field>
                  <div className="col-span-2">
                    <Button onClick={() => setIncidenciasDe(null)} className="w-full">Listo</Button>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
