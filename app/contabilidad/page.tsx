"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  FileBarChart2,
  UploadCloud,
  Download,
  ShieldCheck,
  Printer,
  ClipboardList,
  FileSpreadsheet,
  CalendarCheck2,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { api, postJson, putJson, ApiError, mxn } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { TASAS_DEPRECIACION } from "@/lib/contabilidad/catalogo";
import { REGIMENES_FISCALES, IMPUESTO_LABEL } from "@/lib/contabilidad/obligaciones";
import type {
  Poliza,
  CuentaContable,
  ActivoFijo,
  ReglaContable,
  ConfigFiscal,
  PanelFiscal,
  PerfilFiscal,
  ObligacionFiscal,
  RegimenRegistrado,
  MetodoIsr,
  TipoImpuesto,
} from "@/lib/types";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const TABS = [
  { clave: "polizas", label: "Pólizas", icon: BookOpenCheck },
  { clave: "balanza", label: "Balanza", icon: Scale },
  { clave: "amarre", label: "Amarre", icon: Link2 },
  { clave: "estados", label: "Estados financieros", icon: FileBarChart2 },
  { clave: "impuestos", label: "Impuestos", icon: Percent },
  { clave: "diot", label: "DIOT", icon: FileSpreadsheet },
  { clave: "anual", label: "Anual", icon: CalendarCheck2 },
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

interface MovimientoAuxiliar {
  polizaId: string;
  tipo: string;
  numero: number;
  fecha: string;
  concepto: string;
  origenTipo: string;
  origenId: string;
  debe: number;
  haber: number;
  saldo: number;
}

interface Auxiliar {
  cuenta: CuentaContable | null;
  saldoInicial: number;
  movimientos: MovimientoAuxiliar[];
  totalDebe: number;
  totalHaber: number;
  saldoFinal: number;
}

interface OrigenPoliza {
  tipo: string;
  id: string;
  href?: string;
  label: string;
}

interface Amarre {
  periodo: string;
  ingresos: {
    cfdi: { count: number; subtotal: number; iva: number; total: number };
    contabilizadoTotal: number;
    conPoliza: number;
    sinPoliza: { id: string; folio: string; receptor: string; fecha: string; total: number }[];
    diferencia: number;
  };
  gastos: {
    cfdi: { count: number; total: number };
    contabilizadoTotal: number;
    conPoliza: number;
    sinPoliza: { uuid: string; emisor: string; fecha: string; total: number; deducible: string }[];
    noDeducibles: { count: number; total: number };
    diferencia: number;
  };
  iva: { trasladadoDevengado: number; trasladadoCobrado: number; acreditablePagado: number; aCargo: number } | null;
  hallazgos: string[];
}

interface LineaEstado {
  codigo: string;
  nombre: string;
  importe: number;
}
interface GrupoEstado {
  titulo: string;
  lineas: LineaEstado[];
  total: number;
}
interface EstadosFinancieros {
  cuadrada: boolean;
  resultados: {
    ingresos: GrupoEstado;
    costos: GrupoEstado;
    utilidadBruta: number;
    gastos: GrupoEstado;
    utilidadOperacion: number;
    otros: GrupoEstado;
    utilidadNeta: number;
  };
  situacion: {
    activoCirculante: GrupoEstado;
    activoNoCirculante: GrupoEstado;
    totalActivo: number;
    pasivoCortoPlazo: GrupoEstado;
    pasivoLargoPlazo: GrupoEstado;
    totalPasivo: number;
    capitalContable: GrupoEstado;
    resultadoEjercicio: number;
    totalCapital: number;
    totalPasivoMasCapital: number;
    diferencia: number;
  };
}

interface RenglonDiot {
  tipoTercero: string;
  tipoOperacion: string;
  rfc: string;
  nombre: string;
  base16: number;
  iva16: number;
  base8: number;
  iva8: number;
  base0: number;
  exento: number;
  ivaRetenido: number;
  ivaNoAcreditable: number;
  comprobantes: number;
}
interface DiotData {
  renglones: RenglonDiot[];
  totales: Omit<RenglonDiot, "tipoTercero" | "tipoOperacion" | "rfc" | "nombre">;
  sinXml: number;
}

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

const TIPO_POLIZA: Record<string, { label: string; color: "green" | "red" | "sky" }> = {
  ingresos: { label: "Ingresos", color: "green" },
  egresos: { label: "Egresos", color: "red" },
  diario: { label: "Diario", color: "sky" },
};

const METODO_LABEL: Record<MetodoIsr, string> = {
  auto: "Automático (según régimen registrado)",
  ninguno: "Sin cálculo de ISR",
  resico_pf: "RESICO · Persona Física (Art. 113-E)",
  resico_pm: "RESICO · Persona Moral (flujo)",
  pf_actividad: "Actividades Empresariales y Profesionales (PF)",
  arrendamiento: "Arrendamiento (PF)",
  pm_general: "Régimen General PM (coeficiente de utilidad)",
};

const TIPOS_OBLIGACION: TipoImpuesto[] = [
  "iva_mensual", "isr_provisional_pf", "isr_provisional_pm", "isr_resico_pf", "isr_resico_pm",
  "isr_arrendamiento", "ret_isr_salarios", "ret_isr_servicios", "ret_iva", "isr_anual", "informativa", "otro",
];

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
  const [estados, setEstados] = useState<EstadosFinancieros | null>(null);
  const [diot, setDiot] = useState<DiotData | null>(null);
  const [anual, setAnual] = useState<DeclaracionAnual | null>(null);
  const [ajustes, setAjustes] = useState({ dedPersonales: 0, pagosProv: 0, ptu: 0, perdidas: 0 });
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

  const [amarre, setAmarre] = useState<Amarre | null>(null);

  // Drill-down: auxiliar de una cuenta y detalle de una póliza.
  const [auxiliar, setAuxiliar] = useState<Auxiliar | null>(null);
  const [cargandoAux, setCargandoAux] = useState(false);
  const [polizaDet, setPolizaDet] = useState<{ poliza: Poliza; origen: OrigenPoliza } | null>(null);

  const [modalRegimen, setModalRegimen] = useState(false);
  const [formRegimen, setFormRegimen] = useState({ clave: "626", fechaInicio: "" });
  const [modalObligacion, setModalObligacion] = useState(false);
  const [formObligacion, setFormObligacion] = useState<{ descripcion: string; tipo: TipoImpuesto; fechaInicio: string }>({ descripcion: "", tipo: "iva_mensual", fechaInicio: "" });
  const [importandoCsf, setImportandoCsf] = useState(false);
  const csfInput = useRef<HTMLInputElement>(null);

  const periodo = `anio=${anio}&mes=${mes}`;

  const abrirAuxiliar = async (codigo: string) => {
    setAuxiliar(null);
    setCargandoAux(true);
    try {
      setAuxiliar(await api<Auxiliar>(`/api/contabilidad/auxiliar?${periodo}&cuenta=${encodeURIComponent(codigo)}`));
    } catch (e) {
      setCargandoAux(false);
      toast("error", "No se pudo abrir el auxiliar", e instanceof ApiError ? e.message : String(e));
      return;
    }
    setCargandoAux(false);
  };

  const abrirPoliza = async (id: string) => {
    try {
      setPolizaDet(await api<{ poliza: Poliza; origen: OrigenPoliza }>(`/api/contabilidad/poliza?id=${id}`));
    } catch (e) {
      toast("error", "No se pudo abrir la póliza", e instanceof ApiError ? e.message : String(e));
    }
  };

  const cargar = useCallback(async () => {
    try {
      const [p, b, ef, dt, f, c, a, r] = await Promise.all([
        api<Poliza[]>(`/api/contabilidad/polizas?${periodo}`),
        api<typeof balanza>(`/api/contabilidad/balanza?${periodo}`),
        api<EstadosFinancieros>(`/api/contabilidad/estados?${periodo}`),
        api<DiotData>(`/api/contabilidad/diot?${periodo}`),
        api<typeof fiscal>(`/api/contabilidad/fiscal?${periodo}`),
        api<CuentaContable[]>("/api/contabilidad/cuentas"),
        api<ActivoFijo[]>("/api/contabilidad/activos"),
        api<ReglaContable[]>("/api/contabilidad/reglas"),
      ]);
      setPolizas(p);
      setBalanza(b);
      setEstados(ef);
      setDiot(dt);
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

  const cargarAnual = useCallback(
    async (aj: typeof ajustes) => {
      try {
        const q = `anio=${anio}&dedPersonales=${aj.dedPersonales}&pagosProv=${aj.pagosProv}&ptu=${aj.ptu}&perdidas=${aj.perdidas}`;
        setAnual(await api<DeclaracionAnual>(`/api/contabilidad/anual?${q}`));
      } catch (e) {
        toast("error", "Declaración anual", e instanceof ApiError ? e.message : String(e));
      }
    },
    [anio, toast],
  );

  useEffect(() => {
    if (tab === "anual") {
      setAnual(null);
      cargarAnual(ajustes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, anio]);

  useEffect(() => {
    if (tab !== "amarre") return;
    setAmarre(null);
    api<Amarre>(`/api/contabilidad/amarre?${periodo}`)
      .then(setAmarre)
      .catch((e) => toast("error", "Cédula de amarre", e instanceof ApiError ? e.message : String(e)));
  }, [tab, periodo, toast]);

  const actualizarAjuste = (campo: keyof typeof ajustes, valor: string) => {
    const nuevo = { ...ajustes, [campo]: Number(valor) || 0 };
    setAjustes(nuevo);
    cargarAnual(nuevo);
  };

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

  const guardarFiscal = async (patch: Partial<ConfigFiscal>) => {
    if (!fiscal) return;
    const body: Record<string, unknown> = {
      regimenCalculo: patch.regimenCalculo ?? fiscal.config.regimenCalculo,
      coeficienteUtilidad: patch.coeficienteUtilidad ?? fiscal.config.coeficienteUtilidad,
      deduccionCiegaArrendamiento: patch.deduccionCiegaArrendamiento ?? fiscal.config.deduccionCiegaArrendamiento,
    };
    if (patch.perfil !== undefined) body.perfil = patch.perfil; // solo cuando se edita el perfil
    try {
      const r = await putJson<{ config: ConfigFiscal }>("/api/contabilidad/fiscal", body);
      setFiscal({ ...fiscal, config: r.config });
      await cargar();
    } catch (e) {
      toast("error", "Fiscal", e instanceof ApiError ? e.message : String(e));
    }
  };

  const importarCsf = async (file: File) => {
    setImportandoCsf(true);
    try {
      const form = new FormData();
      form.set("archivo", file);
      const r = await api<{ perfil: PerfilFiscal; aviso?: string }>("/api/contabilidad/constancia", { method: "POST", body: form });
      toast("success", "Constancia importada", `${r.perfil.regimenes.length} régimen(es) y ${r.perfil.obligaciones.length} obligación(es) detectadas.${r.aviso ? ` ${r.aviso}` : ""}`);
      await cargar();
    } catch (e) {
      toast("error", "No se pudo importar la CSF", e instanceof ApiError ? e.message : String(e));
    } finally {
      setImportandoCsf(false);
      if (csfInput.current) csfInput.current.value = "";
    }
  };

  const perfil = fiscal?.config.perfil;

  const guardarRegimen = async () => {
    const cat = REGIMENES_FISCALES.find((r) => r.clave === formRegimen.clave);
    const nuevo: RegimenRegistrado = { clave: formRegimen.clave, nombre: cat?.nombre ?? formRegimen.clave, fechaInicio: formRegimen.fechaInicio || undefined };
    const base: PerfilFiscal = perfil ?? { regimenes: [], obligaciones: [] };
    const regimenes = [...base.regimenes.filter((r) => r.clave !== nuevo.clave), nuevo];
    await guardarFiscal({ perfil: { ...base, regimenes } });
    setModalRegimen(false);
    toast("success", "Régimen agregado");
  };

  const guardarObligacion = async () => {
    if (!formObligacion.descripcion.trim()) return toast("error", "Escribe la descripción de la obligación");
    const nueva: ObligacionFiscal = { descripcion: formObligacion.descripcion.trim(), tipo: formObligacion.tipo, fechaInicio: formObligacion.fechaInicio || undefined };
    const base: PerfilFiscal = perfil ?? { regimenes: [], obligaciones: [] };
    await guardarFiscal({ perfil: { ...base, obligaciones: [...base.obligaciones, nueva] } });
    setModalObligacion(false);
    setFormObligacion({ descripcion: "", tipo: "iva_mensual", fechaInicio: "" });
    toast("success", "Obligación agregada");
  };

  const quitarRegimen = async (clave: string) => {
    if (!perfil) return;
    await guardarFiscal({ perfil: { ...perfil, regimenes: perfil.regimenes.filter((r) => r.clave !== clave) } });
  };
  const quitarObligacion = async (i: number) => {
    if (!perfil) return;
    await guardarFiscal({ perfil: { ...perfil, obligaciones: perfil.obligaciones.filter((_, idx) => idx !== i) } });
  };

  return (
    <div>
      <PageHeader
        title="Contabilidad"
        subtitle="Pólizas automáticas, balanza, estados financieros y un panel de impuestos que se arma con el régimen y las obligaciones de la Constancia de Situación Fiscal."
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
                    <span className="hidden text-[11px] text-ink-400 sm:inline">· clic en una cuenta para ver su auxiliar</span>
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
                          <tr
                            key={r.cuenta.codigo}
                            onClick={() => abrirAuxiliar(r.cuenta.codigo)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirAuxiliar(r.cuenta.codigo); } }}
                            tabIndex={0}
                            role="button"
                            className="cursor-pointer border-b border-slate-50 transition hover:bg-brand-50/50 focus:bg-brand-50"
                            title="Ver auxiliar (movimientos) de la cuenta"
                          >
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

            {/* ---------- CÉDULA DE AMARRE ---------- */}
            {tab === "amarre" && (
              !amarre ? (
                <Spinner label="Amarrando timbrado, contabilizado y fiscal…" />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold">Cédula de amarre · {MESES[Number(mes) - 1]} {anio}</h2>
                    <span className="hidden text-[11px] text-ink-400 sm:inline">timbrado ↔ contabilizado ↔ fiscal</span>
                  </div>

                  {/* Hallazgos */}
                  <div className={`rounded-xl border p-4 text-xs leading-relaxed ${amarre.hallazgos.length === 1 && amarre.hallazgos[0].startsWith("Sin discrepancias") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    <p className="mb-1 flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="size-3.5" /> Hallazgos del amarre
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {amarre.hallazgos.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>

                  {/* Ingresos y gastos */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="card p-4">
                      <p className="mb-3 text-sm font-bold">Ingresos</p>
                      <dl className="space-y-1.5 text-xs">
                        <Fila label={`CFDI emitidos (${amarre.ingresos.cfdi.count})`} valor={mxn.format(amarre.ingresos.cfdi.total)} />
                        <Fila label="— Subtotal" valor={mxn.format(amarre.ingresos.cfdi.subtotal)} sub />
                        <Fila label="— IVA trasladado" valor={mxn.format(amarre.ingresos.cfdi.iva)} sub />
                        <Fila label="Contabilizado (pólizas)" valor={mxn.format(amarre.ingresos.contabilizadoTotal)} />
                        <FilaDif dif={amarre.ingresos.diferencia} />
                        <Fila label="Con póliza / sin póliza" valor={`${amarre.ingresos.conPoliza} / ${amarre.ingresos.sinPoliza.length}`} />
                      </dl>
                    </div>
                    <div className="card p-4">
                      <p className="mb-3 text-sm font-bold">Gastos</p>
                      <dl className="space-y-1.5 text-xs">
                        <Fila label={`CFDI recibidos vigentes (${amarre.gastos.cfdi.count})`} valor={mxn.format(amarre.gastos.cfdi.total)} />
                        <Fila label="Contabilizado (pólizas)" valor={mxn.format(amarre.gastos.contabilizadoTotal)} />
                        <FilaDif dif={amarre.gastos.diferencia} />
                        <Fila label="Con póliza / sin póliza" valor={`${amarre.gastos.conPoliza} / ${amarre.gastos.sinPoliza.length}`} />
                        {amarre.gastos.noDeducibles.count > 0 && (
                          <Fila label={`No deducibles / EFOS (${amarre.gastos.noDeducibles.count})`} valor={mxn.format(amarre.gastos.noDeducibles.total)} alerta />
                        )}
                      </dl>
                    </div>
                  </div>

                  {/* IVA de flujo */}
                  {amarre.iva && (
                    <div className="card p-4">
                      <p className="mb-3 text-sm font-bold">IVA del periodo (flujo)</p>
                      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-ink-400">Trasladado devengado</p><p className="tnum font-bold">{mxn.format(amarre.iva.trasladadoDevengado)}</p></div>
                        <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-ink-400">Trasladado cobrado</p><p className="tnum font-bold">{mxn.format(amarre.iva.trasladadoCobrado)}</p></div>
                        <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-ink-400">Acreditable pagado</p><p className="tnum font-bold">{mxn.format(amarre.iva.acreditablePagado)}</p></div>
                        <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-ink-400">IVA a cargo</p><p className={`tnum font-bold ${amarre.iva.aCargo > 0 ? "text-rose-600" : "text-emerald-700"}`}>{mxn.format(amarre.iva.aCargo)}</p></div>
                      </div>
                    </div>
                  )}

                  {/* Facturas timbradas sin contabilizar */}
                  {amarre.ingresos.sinPoliza.length > 0 && (
                    <div className="card p-4">
                      <p className="mb-2 text-sm font-bold text-rose-700">Facturas timbradas sin contabilizar ({amarre.ingresos.sinPoliza.length})</p>
                      <div className="max-h-56 overflow-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400"><th className="p-1.5">Folio</th><th className="p-1.5">Receptor</th><th className="p-1.5">Fecha</th><th className="p-1.5 text-right">Total</th></tr></thead>
                          <tbody>
                            {amarre.ingresos.sinPoliza.map((f) => (
                              <tr key={f.id} className="border-b border-slate-50">
                                <td className="mono p-1.5">{f.folio}</td>
                                <td className="p-1.5">{f.receptor}</td>
                                <td className="p-1.5">{f.fecha}</td>
                                <td className="tnum p-1.5 text-right">{mxn.format(f.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[11px] text-ink-400">Genera las pólizas del periodo (pestaña Pólizas) para contabilizarlas.</p>
                    </div>
                  )}

                  {/* CFDI recibidos sin póliza */}
                  {amarre.gastos.sinPoliza.length > 0 && (
                    <div className="card p-4">
                      <p className="mb-2 text-sm font-bold text-amber-700">CFDI recibidos sin póliza ({amarre.gastos.sinPoliza.length})</p>
                      <div className="max-h-56 overflow-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400"><th className="p-1.5">Emisor</th><th className="p-1.5">UUID</th><th className="p-1.5">Fecha</th><th className="p-1.5 text-right">Total</th></tr></thead>
                          <tbody>
                            {amarre.gastos.sinPoliza.map((c) => (
                              <tr key={c.uuid} className="border-b border-slate-50">
                                <td className="p-1.5">{c.emisor}</td>
                                <td className="mono p-1.5 text-[10px]">{c.uuid.slice(0, 8)}…</td>
                                <td className="p-1.5">{c.fecha}</td>
                                <td className="tnum p-1.5 text-right">{mxn.format(c.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* ---------- ESTADOS FINANCIEROS ---------- */}
            {tab === "estados" && estados && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold">Estados financieros · acumulado al {MESES[Number(mes) - 1]} {anio}</h2>
                    <Badge color={estados.cuadrada ? "green" : "amber"}>{estados.cuadrada ? "Cuadrado" : "Revisar cuadre"}</Badge>
                  </div>
                  <a href={`/contabilidad/estados/imprimir?anio=${anio}&mes=${mes}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="px-3 py-2 text-xs"><Printer className="size-3.5" /> Exportar PDF</Button>
                  </a>
                </div>

                {estados.resultados.ingresos.total === 0 && estados.situacion.totalActivo === 0 ? (
                  <EmptyState
                    icon={<FileBarChart2 className="size-7" />}
                    title="Aún no hay saldos"
                    detail="Genera las pólizas del periodo para que se construyan el estado de resultados y el estado de situación financiera."
                  />
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {/* Estado de resultados */}
                    <div className="card p-5">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><FileBarChart2 className="size-4 text-brand-600" /> Estado de resultados</h3>
                      <table className="w-full text-xs">
                        <tbody>
                          <GrupoRows grupo={estados.resultados.ingresos} />
                          <GrupoRows grupo={estados.resultados.costos} />
                          <TotalRow label="Utilidad bruta" valor={estados.resultados.utilidadBruta} />
                          <GrupoRows grupo={estados.resultados.gastos} />
                          <TotalRow label="Utilidad de operación" valor={estados.resultados.utilidadOperacion} />
                          {estados.resultados.otros.lineas.length > 0 && <GrupoRows grupo={estados.resultados.otros} />}
                          <TotalRow label="Utilidad antes de impuestos" valor={estados.resultados.utilidadNeta} fuerte />
                        </tbody>
                      </table>
                    </div>

                    {/* Estado de situación financiera */}
                    <div className="card p-5">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Scale className="size-4 text-brand-600" /> Estado de situación financiera</h3>
                      <table className="w-full text-xs">
                        <tbody>
                          <SeccionRow label="ACTIVO" />
                          <GrupoRows grupo={estados.situacion.activoCirculante} />
                          {estados.situacion.activoNoCirculante.lineas.length > 0 && <GrupoRows grupo={estados.situacion.activoNoCirculante} />}
                          <TotalRow label="Total activo" valor={estados.situacion.totalActivo} fuerte />
                          <SeccionRow label="PASIVO" />
                          <GrupoRows grupo={estados.situacion.pasivoCortoPlazo} />
                          {estados.situacion.pasivoLargoPlazo.lineas.length > 0 && <GrupoRows grupo={estados.situacion.pasivoLargoPlazo} />}
                          <TotalRow label="Total pasivo" valor={estados.situacion.totalPasivo} />
                          <SeccionRow label="CAPITAL CONTABLE" />
                          <GrupoRows grupo={estados.situacion.capitalContable} soloLineas />
                          <tr className="border-b border-slate-50">
                            <td className="py-1.5 pl-3 text-ink-600">Resultado del ejercicio</td>
                            <td className="tnum py-1.5 text-right">{mxn.format(estados.situacion.resultadoEjercicio)}</td>
                          </tr>
                          <TotalRow label="Total capital contable" valor={estados.situacion.totalCapital} />
                          <TotalRow label="Total pasivo + capital" valor={estados.situacion.totalPasivoMasCapital} fuerte />
                        </tbody>
                      </table>
                      {Math.abs(estados.situacion.diferencia) >= 0.5 && (
                        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                          Diferencia de cuadre: {mxn.format(estados.situacion.diferencia)}. Revisa que todas las pólizas del ejercicio estén generadas y cuadradas.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-ink-400">
                  Construidos desde la balanza acumulada (saldos a la fecha de corte), clasificando cada cuenta por su código agrupador del SAT. Son informativos para revisión y planeación.
                </p>
              </div>
            )}

            {/* ---------- IMPUESTOS ---------- */}
            {tab === "impuestos" && fiscal && (
              <div className="space-y-4">
                {/* Perfil fiscal / Constancia */}
                <div className="card p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-brand-600" /> Situación fiscal del contribuyente</h2>
                    <div className="flex flex-wrap gap-2">
                      <input ref={csfInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarCsf(f); }} />
                      <Button className="px-3 py-2 text-xs" loading={importandoCsf} onClick={() => csfInput.current?.click()}>
                        <UploadCloud className="size-3.5" /> Importar Constancia (PDF)
                      </Button>
                      {perfil?.csfArchivo && (
                        <a href="/api/contabilidad/constancia/archivo">
                          <Button variant="secondary" className="px-3 py-2 text-xs"><Download className="size-3.5" /> Descargar CSF</Button>
                        </a>
                      )}
                    </div>
                  </div>

                  {!perfil || (perfil.regimenes.length === 0 && perfil.obligaciones.length === 0) ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                      <ClipboardList className="mx-auto mb-2 size-7 text-ink-300" />
                      <p className="text-sm font-semibold">Sin régimen ni obligaciones registradas</p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-ink-400">
                        Sube el PDF de la Constancia de Situación Fiscal (la descargas del SAT con tu RFC) y detecto el régimen y las obligaciones. También puedes capturarlos a mano.
                      </p>
                      <div className="mt-3 flex justify-center gap-2">
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setModalRegimen(true)}><Plus className="size-3.5" /> Régimen</Button>
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setModalObligacion(true)}><Plus className="size-3.5" /> Obligación</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {perfil.rfc && <Badge color="brand">RFC {perfil.rfc}</Badge>}
                        {perfil.situacion && <Badge color={/activo/i.test(perfil.situacion) ? "green" : "amber"}>{perfil.situacion}</Badge>}
                        {perfil.tipoPersona && <Badge color="slate">{perfil.tipoPersona === "moral" ? "Persona moral" : "Persona física"}</Badge>}
                        {perfil.fechaInicioOperaciones && <span className="text-ink-400">Inicio ops.: {perfil.fechaInicioOperaciones}</span>}
                        {perfil.importadaEl && <span className="text-ink-400">· {perfil.fuente === "csf" ? "CSF importada" : "Editado a mano"} {perfil.importadaEl.slice(0, 10)}</span>}
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Regímenes</p>
                          <button onClick={() => setModalRegimen(true)} className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline"><Plus className="size-3" /> Agregar</button>
                        </div>
                        {perfil.regimenes.length === 0 ? (
                          <p className="text-xs text-ink-400">Sin regímenes registrados.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {perfil.regimenes.map((r) => (
                              <div key={r.clave} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                                <Badge color="brand">{r.clave}</Badge>
                                <span className="min-w-0 flex-1 truncate font-semibold">{r.nombre}</span>
                                {r.fechaInicio && <span className="text-ink-400">{r.fechaInicio}</span>}
                                <button onClick={() => quitarRegimen(r.clave)} className="text-rose-500 hover:text-rose-700"><Trash2 className="size-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Obligaciones</p>
                          <button onClick={() => setModalObligacion(true)} className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline"><Plus className="size-3" /> Agregar</button>
                        </div>
                        {perfil.obligaciones.length === 0 ? (
                          <p className="text-xs text-ink-400">Sin obligaciones registradas.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {perfil.obligaciones.map((o, i) => (
                              <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                                <Badge color="sky">{IMPUESTO_LABEL[o.tipo]}</Badge>
                                <span className="min-w-0 flex-1 truncate">{o.descripcion}</span>
                                {o.fechaInicio && <span className="text-ink-400">{o.fechaInicio}</span>}
                                <button onClick={() => quitarObligacion(i)} className="text-rose-500 hover:text-rose-700"><Trash2 className="size-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Método de cálculo */}
                <div className="card p-5">
                  <h2 className="mb-3 text-sm font-bold">Método de cálculo del ISR</h2>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Régimen de cálculo">
                      <Select
                        value={fiscal.config.regimenCalculo}
                        onChange={(e) => guardarFiscal({ regimenCalculo: e.target.value as MetodoIsr })}
                        className="w-80"
                      >
                        {(Object.keys(METODO_LABEL) as MetodoIsr[]).map((m) => (
                          <option key={m} value={m}>{METODO_LABEL[m]}</option>
                        ))}
                      </Select>
                    </Field>
                    {fiscal.config.regimenCalculo === "auto" && (
                      <p className="pb-2 text-xs text-ink-500">
                        Se aplicará: <b>{METODO_LABEL[fiscal.panel.metodoIsr]}</b>
                        {!fiscal.panel.perfilConfigurado && " — registra tu régimen arriba para afinarlo."}
                      </p>
                    )}
                    {fiscal.panel.metodoIsr === "pm_general" && (
                      <Field label="Coeficiente de utilidad" hint="De tu última declaración anual, ej. 0.0854">
                        <Input
                          type="number" step="0.0001" min="0" max="1"
                          defaultValue={fiscal.config.coeficienteUtilidad || ""}
                          onBlur={(e) => guardarFiscal({ coeficienteUtilidad: Number(e.target.value) || 0 })}
                          className="tnum w-36"
                        />
                      </Field>
                    )}
                    {fiscal.panel.metodoIsr === "arrendamiento" && (
                      <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-ink-600">
                        <input
                          type="checkbox"
                          checked={Boolean(fiscal.config.deduccionCiegaArrendamiento)}
                          onChange={(e) => guardarFiscal({ deduccionCiegaArrendamiento: e.target.checked })}
                        />
                        Deducción opcional (35% ciega)
                      </label>
                    )}
                  </div>
                </div>

                {/* Base del periodo */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MiniStat label="Ingresos cobrados" valor={fiscal.panel.base.ingresosCobrados} />
                  <MiniStat label="IVA cobrado" valor={fiscal.panel.base.ivaCobrado} />
                  <MiniStat label="IVA acreditable" valor={fiscal.panel.base.ivaAcreditablePagado} />
                  <MiniStat label="Retenciones a favor" valor={fiscal.panel.base.retencionesAcreditables} />
                </div>

                {/* Conceptos de impuesto */}
                {fiscal.panel.conceptos.length === 0 ? (
                  <EmptyState
                    icon={<Percent className="size-7" />}
                    title="Sin impuestos que calcular este mes"
                    detail="Registra el régimen y las obligaciones del contribuyente (o importa su CSF) y aquí aparecerá el cálculo de cada impuesto que le corresponde."
                  />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {fiscal.panel.conceptos.map((c) => {
                      const esIva = c.tipo === "iva_mensual";
                      const aFavor = esIva && c.aCargo < 0;
                      return (
                        <div key={c.tipo} className="card p-5">
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold">{c.titulo}</h3>
                            <Badge color="slate">{c.periodicidad}</Badge>
                          </div>
                          <dl className="space-y-2 text-sm">
                            {c.reglones.map((r, i) => (
                              <div key={i} className="flex justify-between">
                                <dt className="text-ink-600">{r.etiqueta}</dt>
                                <dd className={`tnum font-bold ${r.tipo === "resta" ? "text-emerald-700" : ""}`}>
                                  {r.tipo === "resta" ? "−" : ""}{mxn.format(Math.abs(r.valor))}
                                </dd>
                              </div>
                            ))}
                            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                              <dt className="font-extrabold">{esIva ? (aFavor ? "IVA a favor" : "IVA a cargo") : "A enterar"}</dt>
                              <dd className={`tnum font-extrabold ${aFavor ? "text-emerald-700" : "text-rose-600"}`}>{mxn.format(Math.abs(c.aCargo))}</dd>
                            </div>
                          </dl>
                          {c.nota && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-ink-500">{c.nota}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-ink-400">
                  Estimaciones informativas de flujo para planeación; la declaración definitiva puede variar por acumulados, deducciones y actualizaciones. Revísalas con tu contador.
                </p>
              </div>
            )}

            {/* ---------- DIOT ---------- */}
            {tab === "diot" && diot && (
              <div className="space-y-4">
                <div className="card p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-bold"><FileSpreadsheet className="size-4 text-brand-600" /> DIOT · {MESES[Number(mes) - 1]} {anio}</h2>
                      <p className="mt-0.5 text-xs text-ink-400">
                        Operaciones con proveedores (CFDI recibidos y pagados). {diot.renglones.length} proveedor(es){diot.sinXml > 0 ? ` · ${diot.sinXml} sin XML (no desglosados)` : ""}.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <a href={`/contabilidad/diot/imprimir?anio=${anio}&mes=${mes}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="secondary" className="px-3 py-2 text-xs"><Printer className="size-3.5" /> PDF</Button>
                      </a>
                      <a href={`/api/contabilidad/diot?${periodo}&formato=csv`}>
                        <Button variant="secondary" className="px-3 py-2 text-xs"><FileDown className="size-3.5" /> CSV (revisión)</Button>
                      </a>
                      <a href={`/api/contabilidad/diot?${periodo}&formato=txt`}>
                        <Button variant="secondary" className="px-3 py-2 text-xs"><Download className="size-3.5" /> Archivo por lotes</Button>
                      </a>
                    </div>
                  </div>

                  {diot.renglones.length === 0 ? (
                    <EmptyState
                      icon={<FileSpreadsheet className="size-7" />}
                      title="Sin operaciones con terceros este mes"
                      detail="La DIOT toma los CFDI recibidos pagados (PUE) del periodo desde la bóveda. Importa o sincroniza tus gastos y aquí aparecerán agrupados por proveedor."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400">
                            <th className="py-2 pr-3">Proveedor</th>
                            <th className="py-2 pr-3">Tipo</th>
                            <th className="py-2 pr-3 text-right">Base 16%</th>
                            <th className="py-2 pr-3 text-right">IVA 16%</th>
                            <th className="py-2 pr-3 text-right">Base 8%</th>
                            <th className="py-2 pr-3 text-right">Base 0%</th>
                            <th className="py-2 pr-3 text-right">Exento</th>
                            <th className="py-2 pr-3 text-right">IVA ret.</th>
                            <th className="py-2 text-right">IVA no acr.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diot.renglones.map((r) => (
                            <tr key={r.rfc} className="border-b border-slate-50">
                              <td className="py-2 pr-3">
                                <span className="mono text-[10px] text-ink-400">{r.rfc}</span>
                                <span className="block max-w-[16rem] truncate">{r.nombre}</span>
                              </td>
                              <td className="py-2 pr-3"><Badge color="slate">{r.tipoTercero}·{r.tipoOperacion}</Badge></td>
                              <td className="tnum py-2 pr-3 text-right">{mxn.format(r.base16)}</td>
                              <td className="tnum py-2 pr-3 text-right">{mxn.format(r.iva16)}</td>
                              <td className="tnum py-2 pr-3 text-right">{r.base8 ? mxn.format(r.base8) : "—"}</td>
                              <td className="tnum py-2 pr-3 text-right">{r.base0 ? mxn.format(r.base0) : "—"}</td>
                              <td className="tnum py-2 pr-3 text-right">{r.exento ? mxn.format(r.exento) : "—"}</td>
                              <td className="tnum py-2 pr-3 text-right">{r.ivaRetenido ? mxn.format(r.ivaRetenido) : "—"}</td>
                              <td className="tnum py-2 text-right">{r.ivaNoAcreditable ? mxn.format(r.ivaNoAcreditable) : "—"}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-slate-300 font-extrabold">
                            <td className="py-2 pr-3">Totales</td>
                            <td />
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(diot.totales.base16)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(diot.totales.iva16)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(diot.totales.base8)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(diot.totales.base0)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(diot.totales.exento)}</td>
                            <td className="tnum py-2 pr-3 text-right">{mxn.format(diot.totales.ivaRetenido)}</td>
                            <td className="tnum py-2 text-right">{mxn.format(diot.totales.ivaNoAcreditable)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-ink-400">
                  Todas las operaciones se clasifican como «85 · Otros» por defecto; ajusta el tipo de operación (03 servicios profesionales, 06 arrendamiento) en el portal del SAT según corresponda. El «archivo por lotes» va en pesos sin decimales; verifica las columnas contra la plantilla vigente de la DIOT antes de enviarlo.
                </p>
              </div>
            )}

            {/* ---------- DECLARACIÓN ANUAL ---------- */}
            {tab === "anual" && (
              <div className="space-y-4">
                {!anual ? (
                  <Spinner label="Acumulando el ejercicio…" />
                ) : anual.metodo === "ninguno" ? (
                  <EmptyState
                    icon={<CalendarCheck2 className="size-7" />}
                    title="Configura el régimen de cálculo"
                    detail="En la pestaña Impuestos registra el régimen del contribuyente (o importa su CSF) para pre-llenar la declaración anual."
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold">Declaración anual pre-llenada · ejercicio {anual.anio}</h2>
                        <Badge color="brand">{METODO_LABEL[anual.metodo]}</Badge>
                      </div>
                      <a href={`/contabilidad/anual/imprimir?anio=${anual.anio}&dedPersonales=${ajustes.dedPersonales}&pagosProv=${ajustes.pagosProv}&ptu=${ajustes.ptu}&perdidas=${ajustes.perdidas}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="secondary" className="px-3 py-2 text-xs"><Printer className="size-3.5" /> Exportar PDF</Button>
                      </a>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* Datos del ejercicio (auto) + ajustes */}
                      <div className="card space-y-4 p-5">
                        <div>
                          <h3 className="mb-2 text-sm font-bold">Datos del ejercicio (automáticos)</h3>
                          <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-ink-600">Ingresos {anual.baseIngresos === "nominales" ? "nominales" : "cobrados"} (sin IVA)</dt>
                              <dd className="tnum font-bold">{mxn.format(anual.ingresos)}</dd>
                            </div>
                            {anual.aplicaDeducciones && (
                              <>
                                <div className="flex justify-between">
                                  <dt className="text-ink-600">Deducciones autorizadas pagadas</dt>
                                  <dd className="tnum font-bold text-emerald-700">−{mxn.format(anual.deduccionesAutorizadas)}</dd>
                                </div>
                                {anual.depreciacion > 0 && (
                                  <div className="flex justify-between pl-3 text-xs">
                                    <dt className="text-ink-400">de las cuales, depreciación</dt>
                                    <dd className="tnum text-ink-400">{mxn.format(anual.depreciacion)}</dd>
                                  </div>
                                )}
                              </>
                            )}
                          </dl>
                          {anual.gastosSinXml > 0 && (
                            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
                              {anual.gastosSinXml} gasto(s) sin XML no se pudieron sumar a las deducciones.
                            </p>
                          )}
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <h3 className="mb-2 text-sm font-bold">Datos que capturas tú</h3>
                          <div className="grid grid-cols-2 gap-3">
                            {anual.aplicaPersonales && (
                              <Field label="Deducciones personales" hint="Médicos, colegiaturas, etc.">
                                <Input type="number" min="0" step="0.01" defaultValue={ajustes.dedPersonales || ""} onBlur={(e) => actualizarAjuste("dedPersonales", e.target.value)} className="tnum" />
                              </Field>
                            )}
                            {anual.aplicaPtu && (
                              <>
                                <Field label="PTU pagada en el ejercicio">
                                  <Input type="number" min="0" step="0.01" defaultValue={ajustes.ptu || ""} onBlur={(e) => actualizarAjuste("ptu", e.target.value)} className="tnum" />
                                </Field>
                                <Field label="Pérdidas fiscales por amortizar">
                                  <Input type="number" min="0" step="0.01" defaultValue={ajustes.perdidas || ""} onBlur={(e) => actualizarAjuste("perdidas", e.target.value)} className="tnum" />
                                </Field>
                              </>
                            )}
                            <Field label="Pagos provisionales del año" hint="Suma de tus pagos mensuales">
                              <Input type="number" min="0" step="0.01" defaultValue={ajustes.pagosProv || ""} onBlur={(e) => actualizarAjuste("pagosProv", e.target.value)} className="tnum" />
                            </Field>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <div className="flex justify-between text-xs">
                            <span className="text-ink-500">IVA cobrado del año (informativo)</span>
                            <span className="tnum">{mxn.format(anual.iva.cobrado)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-ink-500">IVA acreditable del año (informativo)</span>
                            <span className="tnum">{mxn.format(anual.iva.acreditable)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Resultado del ISR anual */}
                      <div className="card p-5">
                        <h3 className="mb-3 text-sm font-bold">ISR del ejercicio</h3>
                        <dl className="space-y-2 text-sm">
                          {anual.aplicaDeducciones ? (
                            <>
                              <div className="flex justify-between"><dt className="text-ink-600">Utilidad fiscal</dt><dd className="tnum font-bold">{mxn.format(anual.utilidadFiscal)}</dd></div>
                              {anual.aplicaPersonales && anual.deduccionesPersonales > 0 && (
                                <div className="flex justify-between"><dt className="text-ink-600">Deducciones personales</dt><dd className="tnum font-bold text-emerald-700">−{mxn.format(anual.deduccionesPersonales)}</dd></div>
                              )}
                              {anual.aplicaPtu && (anual.ptuPagada > 0 || anual.perdidasFiscales > 0) && (
                                <div className="flex justify-between"><dt className="text-ink-600">PTU y pérdidas</dt><dd className="tnum font-bold text-emerald-700">−{mxn.format(anual.ptuPagada + anual.perdidasFiscales)}</dd></div>
                              )}
                              <div className="flex justify-between"><dt className="text-ink-600">Base gravable</dt><dd className="tnum font-bold">{mxn.format(anual.baseGravable)}</dd></div>
                            </>
                          ) : (
                            <div className="flex justify-between"><dt className="text-ink-600">Ingresos base (RESICO)</dt><dd className="tnum font-bold">{mxn.format(anual.baseGravable)}</dd></div>
                          )}
                          <div className="flex justify-between"><dt className="text-ink-600">ISR causado del ejercicio</dt><dd className="tnum font-bold">{mxn.format(anual.isrCausado)}</dd></div>
                          <div className="flex justify-between"><dt className="text-ink-600">Retenciones acreditables</dt><dd className="tnum font-bold text-emerald-700">−{mxn.format(anual.retenciones)}</dd></div>
                          <div className="flex justify-between"><dt className="text-ink-600">Pagos provisionales</dt><dd className="tnum font-bold text-emerald-700">−{mxn.format(anual.pagosProvisionales)}</dd></div>
                          <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                            <dt className="font-extrabold">{anual.isrACargo >= 0 ? "ISR anual a cargo" : "ISR anual a favor"}</dt>
                            <dd className={`tnum font-extrabold ${anual.isrACargo >= 0 ? "text-rose-600" : "text-emerald-700"}`}>{mxn.format(Math.abs(anual.isrACargo))}</dd>
                          </div>
                        </dl>
                        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-ink-500">
                          Borrador informativo del ejercicio {anual.anio} con tarifa anual. La declaración real puede variar (acumulados, coeficiente, deducciones tope, actualizaciones). Revísala con tu contador.
                        </p>
                      </div>
                    </div>
                  </>
                )}
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

      {/* Modal régimen */}
      <Modal open={modalRegimen} onClose={() => setModalRegimen(false)} title="Agregar régimen fiscal">
        <div className="space-y-4">
          <Field label="Régimen (c_RegimenFiscal)">
            <Select value={formRegimen.clave} onChange={(e) => setFormRegimen({ ...formRegimen, clave: e.target.value })}>
              {REGIMENES_FISCALES.map((r) => (
                <option key={r.clave} value={r.clave}>{r.clave} · {r.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de alta (opcional)"><Input type="date" value={formRegimen.fechaInicio} onChange={(e) => setFormRegimen({ ...formRegimen, fechaInicio: e.target.value })} /></Field>
          <Button onClick={guardarRegimen} className="w-full">Agregar régimen</Button>
        </div>
      </Modal>

      {/* Modal obligación */}
      <Modal open={modalObligacion} onClose={() => setModalObligacion(false)} title="Agregar obligación">
        <div className="space-y-4">
          <Field label="Descripción de la obligación">
            <Input value={formObligacion.descripcion} onChange={(e) => setFormObligacion({ ...formObligacion, descripcion: e.target.value })} placeholder="Pago definitivo mensual de IVA" />
          </Field>
          <Field label="Tipo de impuesto">
            <Select value={formObligacion.tipo} onChange={(e) => setFormObligacion({ ...formObligacion, tipo: e.target.value as TipoImpuesto })}>
              {TIPOS_OBLIGACION.map((t) => (
                <option key={t} value={t}>{IMPUESTO_LABEL[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de inicio (opcional)"><Input type="date" value={formObligacion.fechaInicio} onChange={(e) => setFormObligacion({ ...formObligacion, fechaInicio: e.target.value })} /></Field>
          <Button onClick={guardarObligacion} className="w-full">Agregar obligación</Button>
        </div>
      </Modal>

      {/* Auxiliar (mayor) de una cuenta */}
      <Modal
        open={cargandoAux || Boolean(auxiliar)}
        onClose={() => { setAuxiliar(null); setCargandoAux(false); }}
        title={auxiliar?.cuenta ? `Auxiliar · ${auxiliar.cuenta.codigo} ${auxiliar.cuenta.nombre}` : "Auxiliar de la cuenta"}
        subtitle={`Movimientos de ${MESES[Number(mes) - 1]} ${anio}. Haz clic en un renglón para ver su póliza.`}
        wide
      >
        {cargandoAux || !auxiliar ? (
          <Spinner label="Cargando auxiliar…" />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400">
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2">Póliza</th>
                  <th className="py-2 pr-2">Concepto</th>
                  <th className="py-2 pr-2 text-right">Debe</th>
                  <th className="py-2 pr-2 text-right">Haber</th>
                  <th className="py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 text-ink-500">
                  <td className="py-2 pr-2" colSpan={5}>Saldo inicial</td>
                  <td className="tnum py-2 text-right font-semibold">{mxn.format(auxiliar.saldoInicial)}</td>
                </tr>
                {auxiliar.movimientos.map((m, i) => (
                  <tr
                    key={`${m.polizaId}-${i}`}
                    onClick={() => abrirPoliza(m.polizaId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPoliza(m.polizaId); } }}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-brand-50/50 focus:bg-brand-50"
                    title="Ver póliza"
                  >
                    <td className="py-2 pr-2 text-ink-600">{m.fecha}</td>
                    <td className="py-2 pr-2"><span className="mono text-[10px] uppercase text-ink-400">{m.tipo}-{m.numero}</span></td>
                    <td className="py-2 pr-2">{m.concepto}</td>
                    <td className="tnum py-2 pr-2 text-right">{m.debe ? mxn.format(m.debe) : ""}</td>
                    <td className="tnum py-2 pr-2 text-right">{m.haber ? mxn.format(m.haber) : ""}</td>
                    <td className="tnum py-2 text-right font-semibold">{mxn.format(m.saldo)}</td>
                  </tr>
                ))}
                {auxiliar.movimientos.length === 0 && (
                  <tr><td className="py-6 text-center text-ink-400" colSpan={6}>Sin movimientos en el periodo.</td></tr>
                )}
                <tr className="border-t-2 border-slate-300 font-extrabold">
                  <td className="py-2 pr-2" colSpan={3}>Totales del periodo</td>
                  <td className="tnum py-2 pr-2 text-right">{mxn.format(auxiliar.totalDebe)}</td>
                  <td className="tnum py-2 pr-2 text-right">{mxn.format(auxiliar.totalHaber)}</td>
                  <td className="tnum py-2 text-right">{mxn.format(auxiliar.saldoFinal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Detalle de una póliza + enlace a su documento de origen */}
      <Modal
        open={Boolean(polizaDet)}
        onClose={() => setPolizaDet(null)}
        title={polizaDet ? `Póliza ${polizaDet.poliza.tipo.toUpperCase()}-${polizaDet.poliza.numero} · ${polizaDet.poliza.fecha}` : "Póliza"}
        subtitle={polizaDet?.poliza.concepto}
        wide
      >
        {polizaDet && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400">
                    <th className="py-2 pr-3">Cuenta</th>
                    <th className="py-2 pr-3 text-right">Debe</th>
                    <th className="py-2 text-right">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {polizaDet.poliza.movimientos.map((m, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2 pr-3"><span className="mono text-[10px] text-ink-400">{m.cuenta}</span> {m.nombreCuenta}</td>
                      <td className="tnum py-2 pr-3 text-right">{m.debe ? mxn.format(m.debe) : ""}</td>
                      <td className="tnum py-2 text-right">{m.haber ? mxn.format(m.haber) : ""}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 font-extrabold">
                    <td className="py-2 pr-3">Sumas</td>
                    <td className="tnum py-2 pr-3 text-right">{mxn.format(polizaDet.poliza.total)}</td>
                    <td className="tnum py-2 text-right">{mxn.format(polizaDet.poliza.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div className="text-xs">
                <p className="text-ink-400">Documento de origen</p>
                <p className="font-semibold text-ink-900">
                  {polizaDet.origen.label}
                  {polizaDet.origen.tipo === "gasto" && <span className="mono ml-1 text-[10px] text-ink-400">{polizaDet.origen.id.slice(0, 8)}…</span>}
                </p>
              </div>
              {polizaDet.origen.href && (
                <a href={polizaDet.origen.href} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" className="px-3 py-2 text-xs">Abrir origen</Button>
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Subcomponentes ---------- */

function Fila({ label, valor, sub, alerta }: { label: string; valor: string; sub?: boolean; alerta?: boolean }) {
  return (
    <div className={`flex justify-between ${sub ? "pl-3 text-ink-400" : ""}`}>
      <dt className={alerta ? "font-semibold text-rose-600" : "text-ink-600"}>{label}</dt>
      <dd className={`tnum font-semibold ${alerta ? "text-rose-600" : "text-ink-900"}`}>{valor}</dd>
    </div>
  );
}

function FilaDif({ dif }: { dif: number }) {
  const cuadra = Math.abs(dif) < 0.5;
  return (
    <div className="flex justify-between border-t border-slate-100 pt-1.5">
      <dt className="font-bold">Diferencia</dt>
      <dd className={`tnum font-extrabold ${cuadra ? "text-emerald-700" : "text-rose-600"}`}>
        {cuadra ? "Cuadra ✓" : mxn.format(dif)}
      </dd>
    </div>
  );
}

function GrupoRows({ grupo, soloLineas }: { grupo: GrupoEstado; soloLineas?: boolean }) {
  if (grupo.lineas.length === 0) return null;
  return (
    <>
      {!soloLineas && (
        <tr>
          <td colSpan={2} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-400">{grupo.titulo}</td>
        </tr>
      )}
      {grupo.lineas.map((l) => (
        <tr key={l.codigo} className="border-b border-slate-50">
          <td className="py-1.5 pl-3 text-ink-600"><span className="mono text-[10px] text-ink-400">{l.codigo}</span> {l.nombre}</td>
          <td className="tnum py-1.5 text-right">{mxn.format(l.importe)}</td>
        </tr>
      ))}
      {!soloLineas && (
        <tr className="border-b border-slate-100">
          <td className="py-1.5 text-right text-xs font-bold text-ink-500">Total {grupo.titulo.toLowerCase()}</td>
          <td className="tnum py-1.5 text-right font-bold">{mxn.format(grupo.total)}</td>
        </tr>
      )}
    </>
  );
}

function TotalRow({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <tr className={fuerte ? "border-t-2 border-slate-300" : "border-t border-slate-200"}>
      <td className={`py-2 ${fuerte ? "text-sm font-extrabold" : "font-bold"}`}>{label}</td>
      <td className={`tnum py-2 text-right ${fuerte ? "text-sm font-extrabold" : "font-bold"} ${valor < 0 ? "text-rose-600" : ""}`}>{mxn.format(valor)}</td>
    </tr>
  );
}

function SeccionRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="bg-slate-50 py-1.5 pl-2 text-[11px] font-extrabold uppercase tracking-widest text-brand-700">{label}</td>
    </tr>
  );
}

function MiniStat({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="tnum mt-0.5 text-sm font-extrabold">{mxn.format(valor)}</p>
    </div>
  );
}
