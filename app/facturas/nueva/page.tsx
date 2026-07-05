"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Users,
  Package,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CheckCircle2,
  FileText,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { api, postJson, ApiError, mxn } from "@/lib/client";
import { Button, Field, Input, Select, PageHeader, Badge, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  FORMAS_PAGO,
  METODOS_PAGO,
  MONEDAS,
  CLAVES_UNIDAD,
  PERIODICIDADES,
  MESES_GLOBAL,
  usosPermitidos,
  USOS_CFDI,
} from "@/lib/sat/catalogos";
import { esPersonaMoral, esRfcGenerico, RFC_GENERICO_NACIONAL } from "@/lib/sat/rfc";
import type { Emisor, Cliente, Producto, Factura } from "@/lib/types";

interface Linea {
  key: number;
  claveProdServ: string;
  claveUnidad: string;
  descripcion: string;
  cantidad: string;
  valorUnitario: string;
  descuento: string;
  objetoImp: string;
  iva: "16" | "8" | "0" | "exento" | "na";
  retIva: boolean;
  retIsr: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
let lineaKey = 1;

function lineaDesdeProducto(p: Producto): Linea {
  return {
    key: lineaKey++,
    claveProdServ: p.claveProdServ,
    claveUnidad: p.claveUnidad,
    descripcion: p.descripcion,
    cantidad: "1",
    valorUnitario: String(p.valorUnitario),
    descuento: "",
    objetoImp: p.objetoImp,
    iva: p.impuestos.ivaExento ? "exento" : p.impuestos.ivaTasa === null ? "na" : ((p.impuestos.ivaTasa * 100).toFixed(0) as Linea["iva"]),
    retIva: Boolean(p.impuestos.retIvaTasa),
    retIsr: Boolean(p.impuestos.retIsrTasa),
  };
}

const LINEA_MANUAL = (): Linea => ({
  key: lineaKey++,
  claveProdServ: "",
  claveUnidad: "E48",
  descripcion: "",
  cantidad: "1",
  valorUnitario: "",
  descuento: "",
  objetoImp: "02",
  iva: "16",
  retIva: false,
  retIsr: false,
});

function calcularLinea(l: Linea) {
  const cantidad = Number(l.cantidad) || 0;
  const vu = Number(l.valorUnitario) || 0;
  const descuento = Number(l.descuento) || 0;
  const importe = round2(cantidad * vu);
  const base = round2(importe - descuento);
  const grava = l.objetoImp === "02";
  const iva = grava && l.iva !== "exento" && l.iva !== "na" ? round2(base * (Number(l.iva) / 100)) : 0;
  const retIva = grava && l.retIva ? round2(base * 0.106667) : 0;
  const retIsr = grava && l.retIsr ? round2(base * 0.1) : 0;
  return { importe, base, iva, retIva, retIsr };
}

const PASOS = ["Emisor y cliente", "Conceptos", "Pago y emisión"];

export default function NuevaFacturaPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [emisores, setEmisores] = useState<Emisor[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [productos, setProductos] = useState<Producto[] | null>(null);

  const [paso, setPaso] = useState(0);
  const [emisorId, setEmisorId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [formaPago, setFormaPago] = useState("03");
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [moneda, setMoneda] = useState("MXN");
  const [tipoCambio, setTipoCambio] = useState("");
  const [diasCredito, setDiasCredito] = useState("30");
  const [condiciones, setCondiciones] = useState("");
  const [usoCfdi, setUsoCfdi] = useState("");
  const [periodicidad, setPeriodicidad] = useState("04");
  const [mesGlobal, setMesGlobal] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [anioGlobal, setAnioGlobal] = useState(String(new Date().getFullYear()));
  const [emitiendo, setEmitiendo] = useState(false);
  const [emitida, setEmitida] = useState<Factura | null>(null);

  useEffect(() => {
    Promise.all([
      api<Emisor[]>("/api/emisores"),
      api<Cliente[]>("/api/clientes"),
      api<Producto[]>("/api/productos"),
    ])
      .then(([e, c, p]) => {
        setEmisores(e);
        setClientes(c);
        setProductos(p);
        if (e.length === 1) setEmisorId(e[0].id);
      })
      .catch(() => {
        setEmisores([]);
        setClientes([]);
        setProductos([]);
      });
  }, []);

  const emisor = emisores?.find((e) => e.id === emisorId);
  const cliente = clientes?.find((c) => c.id === clienteId);
  const esGlobal = cliente?.rfc === RFC_GENERICO_NACIONAL;

  useEffect(() => {
    if (cliente) setUsoCfdi(cliente.usoCfdi);
  }, [cliente]);

  useEffect(() => {
    if (metodoPago === "PPD") setFormaPago("99");
  }, [metodoPago]);

  const usosDisponibles = useMemo(() => {
    if (!cliente || esRfcGenerico(cliente.rfc)) return USOS_CFDI.filter((u) => u.clave === "S01" || u.clave === "G03");
    return usosPermitidos(cliente.regimenFiscal, esPersonaMoral(cliente.rfc));
  }, [cliente]);

  const totales = useMemo(() => {
    let subTotal = 0, descuento = 0, traslados = 0, retenciones = 0;
    for (const l of lineas) {
      const c = calcularLinea(l);
      subTotal = round2(subTotal + c.importe);
      descuento = round2(descuento + (Number(l.descuento) || 0));
      traslados = round2(traslados + c.iva);
      retenciones = round2(retenciones + c.retIva + c.retIsr);
    }
    return { subTotal, descuento, traslados, retenciones, total: round2(subTotal - descuento + traslados - retenciones) };
  }, [lineas]);

  const puedeAvanzar =
    paso === 0 ? Boolean(emisor && cliente && emisor.csd) :
    paso === 1 ? lineas.length > 0 && lineas.every((l) => l.descripcion.trim() && Number(l.cantidad) > 0 && Number(l.valorUnitario) >= 0 && /^\d{8}$/.test(l.claveProdServ)) :
    true;

  const actualizarLinea = (key: number, patch: Partial<Linea>) => {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const emitir = async () => {
    setEmitiendo(true);
    try {
      const factura = await postJson<Factura>("/api/facturas", {
        emisorId,
        clienteId,
        formaPago,
        metodoPago,
        moneda,
        tipoCambio: moneda !== "MXN" ? Number(tipoCambio) : undefined,
        condicionesDePago: condiciones,
        usoCfdi,
        diasCredito: metodoPago === "PPD" ? Number(diasCredito) || 30 : undefined,
        informacionGlobal: esGlobal ? { periodicidad, meses: mesGlobal, anio: anioGlobal } : undefined,
        conceptos: lineas.map((l) => ({
          claveProdServ: l.claveProdServ,
          claveUnidad: l.claveUnidad,
          descripcion: l.descripcion,
          cantidad: Number(l.cantidad),
          valorUnitario: Number(l.valorUnitario),
          descuento: Number(l.descuento) || 0,
          objetoImp: l.objetoImp,
          impuestos: {
            ivaTasa: l.iva === "exento" || l.iva === "na" ? null : Number(l.iva) / 100,
            ivaExento: l.iva === "exento",
            retIvaTasa: l.retIva ? 0.106667 : null,
            retIsrTasa: l.retIsr ? 0.1 : null,
            iepsTasa: null,
          },
        })),
      });
      if (factura.estado === "timbrada") {
        setEmitida(factura);
      } else {
        toast("error", "La factura se selló pero el timbrado falló", factura.errorMsg);
        router.push(`/facturas/${factura.id}`);
      }
    } catch (e) {
      toast("error", "No se pudo emitir", e instanceof ApiError ? e.message : String(e));
    } finally {
      setEmitiendo(false);
    }
  };

  if (!emisores || !clientes || !productos) return <Spinner label="Preparando el asistente…" />;

  /* Pantalla de éxito */
  if (emitida) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-lg pt-10">
        <div className="card relative overflow-hidden p-10 text-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-50/80 to-transparent" />
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
            className="relative mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl shadow-emerald-500/30"
          >
            <CheckCircle2 className="size-10 text-white" />
          </motion.div>
          <h1 className="relative text-2xl font-extrabold">¡Factura timbrada!</h1>
          <p className="relative mt-2 text-sm text-ink-600">
            {emitida.serie}-{emitida.folio} para <b>{emitida.receptorNombre}</b> por{" "}
            <b className="tnum">{mxn.format(emitida.total)}</b>
          </p>
          {emitida.demo && (
            <p className="relative mx-auto mt-3 max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Timbre DEMO sin validez fiscal. Configura un PAC real en Configuración para emitir facturas válidas.
            </p>
          )}
          <p className="mono relative mt-3 break-all text-[11px] text-ink-400">UUID: {emitida.uuid}</p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-2">
            <Link href={`/facturas/${emitida.id}`}>
              <Button variant="secondary">
                <FileText className="size-4" /> Ver factura
              </Button>
            </Link>
            <Link href={`/facturas/${emitida.id}/imprimir`}>
              <Button variant="secondary">
                <Printer className="size-4" /> Representación impresa
              </Button>
            </Link>
            <Button
              onClick={() => {
                setEmitida(null);
                setLineas([]);
                setPaso(0);
              }}
            >
              <Sparkles className="size-4" /> Emitir otra
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <PageHeader title="Nueva factura" subtitle="CFDI 4.0 de ingreso, sellado con tu CSD y timbrado al instante." />

      {/* Indicador de pasos */}
      <div className="mb-8 flex items-center gap-2">
        {PASOS.map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <button
              onClick={() => i < paso && setPaso(i)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                i === paso
                  ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-lg shadow-brand-600/25"
                  : i < paso
                    ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
                    : "bg-slate-100 text-ink-400"
              }`}
            >
              <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${i === paso ? "bg-white/20" : i < paso ? "bg-brand-200" : "bg-slate-200"}`}>
                {i + 1}
              </span>
              {p}
            </button>
            {i < PASOS.length - 1 && <ChevronRight className="size-4 text-ink-400" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* PASO 1: emisor y cliente */}
        {paso === 0 && (
          <motion.div key="p0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Building2 className="size-4 text-brand-600" /> ¿Quién factura?
                </p>
                {emisores.length === 0 ? (
                  <p className="text-sm text-ink-600">
                    No tienes emisores.{" "}
                    <Link href="/emisores" className="font-semibold text-brand-600">
                      Crea uno aquí →
                    </Link>
                  </p>
                ) : (
                  <div className="space-y-2">
                    {emisores.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setEmisorId(e.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                          emisorId === e.id ? "border-brand-500 bg-brand-50/50 shadow-sm" : "border-slate-100 hover:border-brand-200"
                        }`}
                      >
                        <div className="flex size-9 items-center justify-center rounded-lg text-xs font-extrabold text-white" style={{ background: e.colorTag }}>
                          {e.nombre.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{e.nombre}</p>
                          <p className="mono text-xs text-ink-400">{e.rfc}</p>
                        </div>
                        {e.csd ? <Badge color="green">CSD ✓</Badge> : <Badge color="red">Sin CSD</Badge>}
                      </button>
                    ))}
                  </div>
                )}
                {emisor && !emisor.csd && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    Este emisor no tiene CSD: no se puede sellar. Súbelo en Emisores → Administrar certificados.
                  </p>
                )}
              </div>

              <div className="card p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Users className="size-4 text-brand-600" /> ¿Para quién?
                </p>
                {clientes.length === 0 ? (
                  <p className="text-sm text-ink-600">
                    No tienes clientes.{" "}
                    <Link href="/clientes" className="font-semibold text-brand-600">
                      Registra uno aquí →
                    </Link>
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {clientes.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setClienteId(c.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                          clienteId === c.id ? "border-brand-500 bg-brand-50/50 shadow-sm" : "border-slate-100 hover:border-brand-200"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{c.nombre}</p>
                          <p className="mono text-xs text-ink-400">{c.rfc}</p>
                        </div>
                        <Badge color="sky">{c.usoCfdi}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {esGlobal && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 p-5">
                <p className="mb-3 text-sm font-bold">Factura global (público en general)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Periodicidad">
                    <Select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
                      {PERIODICIDADES.map((p) => (
                        <option key={p.clave} value={p.clave}>{p.descripcion}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Mes">
                    <Select value={mesGlobal} onChange={(e) => setMesGlobal(e.target.value)}>
                      {MESES_GLOBAL.slice(0, 12).map((m) => (
                        <option key={m.clave} value={m.clave}>{m.descripcion}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Año">
                    <Input value={anioGlobal} onChange={(e) => setAnioGlobal(e.target.value.replace(/\D/g, "").slice(0, 4))} className="tnum" />
                  </Field>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* PASO 2: conceptos */}
        {paso === 1 && (
          <motion.div key="p1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
            {productos.length > 0 && (
              <div className="card mb-4 p-4">
                <p className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-600">
                  <Package className="size-4 text-brand-600" /> Agregar de tu catálogo
                </p>
                <div className="flex flex-wrap gap-2">
                  {productos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setLineas((ls) => [...ls, lineaDesdeProducto(p)])}
                      className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-2 text-xs font-semibold text-ink-900 shadow-sm transition hover:border-brand-400 hover:bg-brand-50"
                    >
                      {p.descripcion.length > 38 ? p.descripcion.slice(0, 38) + "…" : p.descripcion}
                      <span className="tnum text-ink-400">{mxn.format(p.valorUnitario)}</span>
                      <Plus className="size-3.5 rounded-full bg-brand-100 p-0.5 text-brand-700 group-hover:bg-brand-600 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <AnimatePresence>
                {lineas.map((l) => {
                  const calc = calcularLinea(l);
                  return (
                    <motion.div
                      key={l.key}
                      layout
                      initial={{ opacity: 0, y: 12, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0 }}
                      className="card p-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-12">
                        <Field label="Descripción" className="lg:col-span-4">
                          <Input value={l.descripcion} onChange={(e) => actualizarLinea(l.key, { descripcion: e.target.value })} placeholder="¿Qué estás cobrando?" />
                        </Field>
                        <Field label="Clave SAT" className="lg:col-span-2">
                          <Input value={l.claveProdServ} onChange={(e) => actualizarLinea(l.key, { claveProdServ: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="8 dígitos" className="mono" />
                        </Field>
                        <Field label="Unidad" className="lg:col-span-2">
                          <Select value={l.claveUnidad} onChange={(e) => actualizarLinea(l.key, { claveUnidad: e.target.value })}>
                            {CLAVES_UNIDAD.map((u) => (
                              <option key={u.clave} value={u.clave}>{u.clave} · {u.descripcion}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Cantidad" className="lg:col-span-1">
                          <Input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => actualizarLinea(l.key, { cantidad: e.target.value })} className="tnum" />
                        </Field>
                        <Field label="P. unitario" className="lg:col-span-2">
                          <Input type="number" min="0" step="0.01" value={l.valorUnitario} onChange={(e) => actualizarLinea(l.key, { valorUnitario: e.target.value })} className="tnum" />
                        </Field>
                        <div className="flex items-end justify-end lg:col-span-1">
                          <button onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                        <label className="flex items-center gap-1.5 font-medium text-ink-600">
                          IVA
                          <select value={l.iva} onChange={(e) => actualizarLinea(l.key, { iva: e.target.value as Linea["iva"] })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                            <option value="16">16%</option>
                            <option value="8">8%</option>
                            <option value="0">0%</option>
                            <option value="exento">Exento</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1.5 font-medium text-ink-600">
                          <input type="checkbox" checked={l.retIsr} onChange={(e) => actualizarLinea(l.key, { retIsr: e.target.checked })} className="size-3.5 accent-brand-600" />
                          Ret. ISR 10%
                        </label>
                        <label className="flex items-center gap-1.5 font-medium text-ink-600">
                          <input type="checkbox" checked={l.retIva} onChange={(e) => actualizarLinea(l.key, { retIva: e.target.checked })} className="size-3.5 accent-brand-600" />
                          Ret. IVA ⅔
                        </label>
                        <label className="flex items-center gap-1.5 font-medium text-ink-600">
                          Descuento $
                          <input type="number" min="0" step="0.01" value={l.descuento} onChange={(e) => actualizarLinea(l.key, { descuento: e.target.value })} className="tnum w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs" placeholder="0.00" />
                        </label>
                        <span className="tnum ml-auto text-sm font-bold text-ink-900">
                          {mxn.format(round2(calc.base + calc.iva - calc.retIva - calc.retIsr))}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <button
              onClick={() => setLineas((ls) => [...ls, LINEA_MANUAL()])}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3.5 text-sm font-semibold text-ink-600 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700"
            >
              <Plus className="size-4" /> Agregar concepto manual
            </button>
          </motion.div>
        )}

        {/* PASO 3: pago y emisión */}
        {paso === 2 && emisor && cliente && (
          <motion.div key="p2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }} className="grid gap-4 lg:grid-cols-5">
            <div className="card space-y-4 p-5 lg:col-span-3">
              <p className="text-sm font-bold">Condiciones de pago</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Método de pago" hint={metodoPago === "PPD" ? "PPD: pagarás después; forma 99." : "PUE: pagado en el momento."}>
                  <Select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                    {METODOS_PAGO.map((m) => (
                      <option key={m.clave} value={m.clave}>{m.clave} · {m.descripcion}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Forma de pago">
                  <Select value={formaPago} onChange={(e) => setFormaPago(e.target.value)} disabled={metodoPago === "PPD"}>
                    {FORMAS_PAGO.map((f) => (
                      <option key={f.clave} value={f.clave}>{f.clave} · {f.descripcion}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Uso CFDI">
                  <Select value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}>
                    {usosDisponibles.map((u) => (
                      <option key={u.clave} value={u.clave}>{u.clave} · {u.descripcion}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Moneda">
                  <Select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                    {MONEDAS.map((m) => (
                      <option key={m.clave} value={m.clave}>{m.clave} · {m.descripcion}</option>
                    ))}
                  </Select>
                </Field>
                {moneda !== "MXN" && (
                  <Field label={`Tipo de cambio (${moneda}→MXN)`}>
                    <Input type="number" min="0" step="0.0001" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className="tnum" placeholder="17.05" />
                  </Field>
                )}
                {metodoPago === "PPD" && (
                  <Field label="Días de crédito" hint="Para la cartera de cobranza.">
                    <Input type="number" min="1" max="365" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} className="tnum" />
                  </Field>
                )}
                <Field label="Condiciones (opcional)" className={moneda !== "MXN" ? "" : "col-span-1"}>
                  <Input value={condiciones} onChange={(e) => setCondiciones(e.target.value)} placeholder="Contado" />
                </Field>
              </div>
            </div>

            <div className="card h-fit p-5 lg:col-span-2">
              <p className="mb-3 text-sm font-bold">Resumen</p>
              <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs">
                <p className="font-bold text-ink-900">{emisor.nombre}</p>
                <p className="text-ink-400">factura a</p>
                <p className="font-bold text-ink-900">{cliente.nombre}</p>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd className="tnum font-semibold">{mxn.format(totales.subTotal)}</dd></div>
                {totales.descuento > 0 && (
                  <div className="flex justify-between"><dt className="text-ink-600">Descuento</dt><dd className="tnum font-semibold text-rose-600">−{mxn.format(totales.descuento)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-ink-600">Impuestos trasladados</dt><dd className="tnum font-semibold">{mxn.format(totales.traslados)}</dd></div>
                {totales.retenciones > 0 && (
                  <div className="flex justify-between"><dt className="text-ink-600">Impuestos retenidos</dt><dd className="tnum font-semibold text-rose-600">−{mxn.format(totales.retenciones)}</dd></div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                  <dt className="font-extrabold">Total</dt>
                  <dd className="tnum font-extrabold text-brand-700">{mxn.format(totales.total)}</dd>
                </div>
              </dl>
              <Button onClick={emitir} loading={emitiendo} className="mt-5 w-full py-3 text-base">
                <Sparkles className="size-5" /> Sellar y timbrar
              </Button>
              <p className="mt-2 text-center text-[11px] text-ink-400">
                Se generará el XML, se sellará con el CSD y se enviará al PAC.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navegación */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
          <ChevronLeft className="size-4" /> Anterior
        </Button>
        {paso < 2 && (
          <Button onClick={() => setPaso((p) => p + 1)} disabled={!puedeAvanzar}>
            Continuar <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
