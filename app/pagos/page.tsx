"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { HandCoins, Plus, FileDown, Ban, Search } from "lucide-react";
import { api, postJson, ApiError, mxn, fechaCorta } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSesion } from "@/components/session-provider";
import { FiltroPeriodo, usePeriodo } from "@/components/filtro-periodo";
import { FORMAS_PAGO } from "@/lib/sat/catalogos";
import type { PagoRep, Factura } from "@/lib/types";

interface ItemCartera {
  factura: Factura;
  saldo: number;
  parcialidades: number;
  vencimiento: string;
  diasParaVencer: number;
}

const ESTADO_BADGE: Record<string, { color: "green" | "red" | "amber" | "slate"; label: string }> = {
  timbrada: { color: "green", label: "Timbrado" },
  cancelada: { color: "red", label: "Cancelado" },
  error: { color: "amber", label: "Error" },
};

const FILTROS_ESTADO = [
  { clave: "", label: "Todos" },
  { clave: "timbrada", label: "Timbrados" },
  { clave: "cancelada", label: "Cancelados" },
  { clave: "error", label: "Con error" },
] as const;

export default function PagosPage() {
  const { toast } = useToast();
  const { sesion } = useSesion();
  const [pagos, setPagos] = useState<PagoRep[] | null>(null);
  const [cartera, setCartera] = useState<ItemCartera[]>([]);
  const [filtro, setFiltro] = useState("");
  const periodoCtrl = usePeriodo(); // default: este mes
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [seleccion, setSeleccion] = useState<Record<string, string>>({}); // facturaId → monto
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [formaPago, setFormaPago] = useState("03");
  const [emitiendo, setEmitiendo] = useState(false);

  const cargar = useCallback(async () => {
    const [p, c] = await Promise.all([
      api<PagoRep[]>("/api/pagos"),
      api<{ items: ItemCartera[] }>("/api/cxc"),
    ]);
    setPagos(p);
    setCartera(c.items);
  }, []);

  useEffect(() => {
    cargar().catch(() => setPagos([]));
  }, [cargar]);

  const empresaActivaId = sesion?.empresaActivaId;
  const carteraEmpresa = useMemo(
    () => cartera.filter((i) => i.factura.emisorId === empresaActivaId),
    [cartera, empresaActivaId],
  );
  const clientesConSaldo = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; rfc: string; saldo: number }>();
    for (const i of carteraEmpresa) {
      const c = map.get(i.factura.clienteId) ?? {
        id: i.factura.clienteId,
        nombre: i.factura.receptorNombre,
        rfc: i.factura.receptorRfc,
        saldo: 0,
      };
      c.saldo += i.saldo;
      map.set(i.factura.clienteId, c);
    }
    return [...map.values()];
  }, [carteraEmpresa]);

  const facturasDelCliente = carteraEmpresa.filter((i) => i.factura.clienteId === clienteId);
  const totalPago = Object.values(seleccion).reduce((s, v) => s + (Number(v) || 0), 0);

  const filtrados = (pagos ?? []).filter((p) => {
    if (filtro && p.estado !== filtro) return false;
    if (!periodoCtrl.enPeriodo(p.fechaPago)) return false;
    const q = busqueda.toLowerCase();
    return (
      !q ||
      p.receptorNombre.toLowerCase().includes(q) ||
      p.receptorRfc.toLowerCase().includes(q) ||
      `${p.serie}-${p.folio}`.toLowerCase().includes(q) ||
      (p.uuid ?? "").toLowerCase().includes(q)
    );
  });

  const limpiarFiltros = () => {
    setFiltro("");
    periodoCtrl.aplicar("");
    setBusqueda("");
  };

  const abrir = () => {
    setClienteId(clientesConSaldo[0]?.id ?? "");
    setSeleccion({});
    setModal(true);
  };

  const toggleFactura = (item: ItemCartera, activo: boolean) => {
    setSeleccion((s) => {
      const nuevo = { ...s };
      if (activo) nuevo[item.factura.id] = String(item.saldo);
      else delete nuevo[item.factura.id];
      return nuevo;
    });
  };

  const emitir = async () => {
    const doctos = Object.entries(seleccion)
      .filter(([, v]) => Number(v) > 0)
      .map(([facturaId, v]) => ({ facturaId, pagado: Number(v) }));
    if (!doctos.length) {
      toast("error", "Selecciona al menos una factura y su monto");
      return;
    }
    setEmitiendo(true);
    try {
      const pago = await postJson<PagoRep>("/api/pagos", { clienteId, fechaPago, formaPago, doctos });
      if (pago.estado === "timbrada") {
        toast("success", `Complemento P-${pago.folio} timbrado`, `${mxn.format(pago.monto)} aplicados a ${pago.doctos.length} factura(s).${pago.demo ? " (timbre DEMO)" : ""}`);
      } else {
        toast("error", "El REP se selló pero el timbrado falló", pago.errorMsg);
      }
      setModal(false);
      await cargar();
    } catch (e) {
      toast("error", "No se pudo emitir el complemento", e instanceof ApiError ? e.message : String(e));
    } finally {
      setEmitiendo(false);
    }
  };

  const cancelarRep = async (p: PagoRep) => {
    if (!confirm(`¿Cancelar el complemento ${p.serie}-${p.folio}? El saldo de las facturas se restaurará.`)) return;
    try {
      await postJson(`/api/pagos/${p.id}/cancelar`, { motivo: "02" });
      toast("success", "Complemento cancelado");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo cancelar", e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Complementos de pago (REP 2.0)"
        subtitle="Documenta los pagos que recibes de facturas PPD: parcialidades, saldos e impuestos proporcionales, timbrado como CFDI tipo P."
        actions={
          <Button onClick={abrir} disabled={clientesConSaldo.length === 0 && pagos !== null}>
            <Plus className="size-4" /> Registrar pago recibido
          </Button>
        }
      />

      {pagos && pagos.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.clave}
                onClick={() => setFiltro(f.clave)}
                className={`relative rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  filtro === f.clave ? "text-white" : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {filtro === f.clave && (
                  <motion.span layoutId="pagos-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 shadow" />
                )}
                <span className="relative">{f.label}</span>
              </button>
            ))}
          </div>
          <FiltroPeriodo ctrl={periodoCtrl} />
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input className="pl-9" placeholder="Cliente, RFC, folio o UUID…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        </div>
      )}

      {pagos === null ? (
        <Spinner label="Cargando complementos…" />
      ) : pagos.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="size-7" />}
          title="Sin complementos de pago"
          detail={
            clientesConSaldo.length === 0
              ? "Cuando emitas facturas PPD (pago en parcialidades o diferido) y recibas pagos, aquí generarás sus REP. Ahora mismo no hay facturas PPD con saldo en la empresa activa."
              : `Tienes ${clientesConSaldo.length} cliente(s) con saldo pendiente. Registra su pago para generar el complemento.`
          }
          action={
            clientesConSaldo.length > 0 ? (
              <Button onClick={abrir}>
                <Plus className="size-4" /> Registrar pago
              </Button>
            ) : undefined
          }
        />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<Search className="size-7" />}
          title="Sin resultados"
          detail="Ningún complemento coincide con los filtros elegidos."
          action={
            <Button variant="secondary" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100">
          {filtrados.map((p) => {
            const badge = ESTADO_BADGE[p.estado] ?? { color: "slate" as const, label: p.estado };
            return (
              <motion.div key={p.id} variants={listItem} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-[10px] font-extrabold text-emerald-700">
                  {p.serie}-{p.folio}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.receptorNombre}</p>
                  <p className="mono truncate text-xs text-ink-400">
                    {p.doctos.length} factura(s) · pago del {p.fechaPago.slice(0, 10)}
                    {p.uuid ? ` · ${p.uuid}` : ""}
                  </p>
                </div>
                <span className="hidden text-xs text-ink-400 sm:block">{fechaCorta(p.creadoEl)}</span>
                <Badge color={badge.color}>{badge.label}</Badge>
                {p.origen === "descarga" && <Badge color="sky">Descargado SAT</Badge>}
                {p.demo && <Badge color="amber">DEMO</Badge>}
                <span className="tnum w-28 shrink-0 text-right text-sm font-extrabold">{mxn.format(p.monto)}</span>
                <div className="flex shrink-0 gap-1">
                  {p.xmlPath && (
                    <a href={`/api/pagos/${p.id}/xml`} className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-600" title="Descargar XML">
                      <FileDown className="size-4" />
                    </a>
                  )}
                  {p.estado === "timbrada" && p.origen !== "descarga" && (
                    <button onClick={() => cancelarRep(p)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600" title="Cancelar">
                      <Ban className="size-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Asistente de pago */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registrar pago recibido"
        subtitle="Selecciona las facturas PPD que cubre este pago; los impuestos se prorratean automáticamente."
        wide
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cliente">
              <Select
                value={clienteId}
                onChange={(e) => {
                  setClienteId(e.target.value);
                  setSeleccion({});
                }}
              >
                {clientesConSaldo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · saldo {mxn.format(c.saldo)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha del pago">
              <Input type="date" value={fechaPago} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setFechaPago(e.target.value)} />
            </Field>
            <Field label="Forma de pago">
              <Select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                {FORMAS_PAGO.filter((f) => f.clave !== "99").map((f) => (
                  <option key={f.clave} value={f.clave}>
                    {f.clave} · {f.descripcion}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
            {facturasDelCliente.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-400">Este cliente no tiene facturas PPD con saldo.</p>
            )}
            {facturasDelCliente.map((item) => {
              const activa = item.factura.id in seleccion;
              return (
                <div key={item.factura.id} className={`flex items-center gap-3 rounded-lg border-2 p-3 transition ${activa ? "border-brand-400 bg-brand-50/40" : "border-slate-100"}`}>
                  <input type="checkbox" checked={activa} onChange={(e) => toggleFactura(item, e.target.checked)} className="size-4 accent-brand-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {item.factura.serie}-{item.factura.folio}
                      <span className="ml-2 text-xs font-medium text-ink-400">
                        parcialidad {item.parcialidades + 1} · vence {item.vencimiento}
                        {item.diasParaVencer < 0 && <span className="font-bold text-rose-600"> · vencida</span>}
                      </span>
                    </p>
                    <p className="text-xs text-ink-600">
                      Total {mxn.format(item.factura.total)} · <b>saldo {mxn.format(item.saldo)}</b>
                    </p>
                  </div>
                  {activa && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-ink-400">Pagado $</span>
                      <input
                        type="number"
                        min="0.01"
                        max={item.saldo}
                        step="0.01"
                        value={seleccion[item.factura.id]}
                        onChange={(e) => setSeleccion({ ...seleccion, [item.factura.id]: e.target.value })}
                        className="tnum w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-semibold"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-bold">Monto total del pago</span>
            <span className="tnum text-lg font-extrabold text-brand-700">{mxn.format(totalPago)}</span>
          </div>
          <Button onClick={emitir} loading={emitiendo} className="w-full py-3">
            <HandCoins className="size-5" /> Sellar y timbrar complemento
          </Button>
        </div>
      </Modal>
    </div>
  );
}
