"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, ShieldX, AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { api, putJson, ApiError, mxn } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { FiltroPeriodo, usePeriodo } from "@/components/filtro-periodo";

interface CxpItem {
  uuid: string;
  empresaId: string;
  emisorRfc: string;
  emisorNombre?: string;
  fecha: string;
  total: number;
  metodoPago?: string;
  formaPago?: string;
  estatusSat: string;
  efos?: string | null;
  deducible: string;
  motivoNoDeducible?: string;
  estadoPago: "pendiente" | "programada" | "pagada";
  fechaProgramada?: string;
  nota?: string;
}

const FILTROS = [
  { clave: "", label: "Todos" },
  { clave: "pendiente", label: "Pendientes" },
  { clave: "programada", label: "Programados" },
  { clave: "pagada", label: "Pagados" },
] as const;

export default function CxpPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<CxpItem[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const periodoCtrl = usePeriodo(); // default: este mes (fecha del CFDI)
  const [editando, setEditando] = useState<CxpItem | null>(null);
  const [estadoPago, setEstadoPago] = useState("programada");
  const [fechaProg, setFechaProg] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setItems(await api<CxpItem[]>("/api/cxp"));
  }, []);

  useEffect(() => {
    cargar().catch(() => setItems([]));
  }, [cargar]);

  // El periodo filtra por la fecha del CFDI del proveedor.
  const delPeriodo = useMemo(
    () => (items ?? []).filter((i) => periodoCtrl.enPeriodo(i.fecha)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, periodoCtrl.desde, periodoCtrl.hasta],
  );
  const visibles = delPeriodo.filter((i) => !filtro || i.estadoPago === filtro);

  const porPagar = useMemo(() => {
    const pendientes = delPeriodo.filter((i) => i.estadoPago !== "pagada" && i.estatusSat !== "cancelado");
    return {
      total: pendientes.reduce((s, i) => s + i.total, 0),
      cantidad: pendientes.length,
      bloqueados: pendientes.filter((i) => i.deducible !== "ok").length,
    };
  }, [delPeriodo]);

  const abrirEditar = (item: CxpItem) => {
    setEditando(item);
    setEstadoPago(item.estadoPago === "pendiente" ? "programada" : item.estadoPago);
    setFechaProg(item.fechaProgramada ?? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    setNota(item.nota ?? "");
  };

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      await putJson("/api/cxp", {
        uuid: editando.uuid,
        empresaId: editando.empresaId,
        estadoPago,
        fechaProgramada: fechaProg,
        nota,
      });
      toast("success", estadoPago === "pagada" ? "Marcado como pagado" : "Pago programado");
      setEditando(null);
      await cargar();
    } catch (e) {
      toast("error", "No se pudo guardar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cuentas por pagar"
        subtitle="Los CFDI de tus proveedores (desde la bóveda) con su blindaje fiscal y programación de pago."
      />

      {items && items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap items-center gap-3">
          <div className="card px-4 py-2.5">
            <span className="text-xs text-ink-400">Por pagar: </span>
            <span className="tnum text-sm font-extrabold text-brand-700">{mxn.format(porPagar.total)}</span>
            <span className="ml-1 text-xs text-ink-400">({porPagar.cantidad})</span>
          </div>
          {porPagar.bloqueados > 0 && (
            <Badge color="red">{porPagar.bloqueados} con problema fiscal — revisa antes de pagar</Badge>
          )}
          <FiltroPeriodo ctrl={periodoCtrl} />
          <div className="ml-auto flex rounded-xl bg-slate-100 p-1">
            {FILTROS.map((f) => (
              <button
                key={f.clave}
                onClick={() => setFiltro(f.clave)}
                className={`relative rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${filtro === f.clave ? "text-white" : "text-ink-600"}`}
              >
                {filtro === f.clave && (
                  <motion.span layoutId="cxp-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 shadow" />
                )}
                <span className="relative">{f.label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {items === null ? (
        <Spinner label="Cargando cuentas por pagar…" />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-7" />}
          title={filtro || periodoCtrl.desde || periodoCtrl.hasta ? "Nada con estos filtros" : "Sin CFDI de proveedores"}
          detail={
            filtro || periodoCtrl.desde || periodoCtrl.hasta
              ? "Prueba con otro estado o periodo. Ojo: los CFDI pendientes de meses anteriores no aparecen en «Este mes»."
              : "Los comprobantes recibidos llegan aquí desde la Bóveda (sincronización con el SAT o importación de XML)."
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
          {visibles.map((i) => (
            <motion.div key={`${i.uuid}-${i.empresaId}`} variants={listItem} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{i.emisorNombre || i.emisorRfc}</p>
                <p className="mono truncate text-[11px] text-ink-400">
                  {i.uuid} · {i.fecha.slice(0, 10)}
                  {i.metodoPago ? ` · ${i.metodoPago}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {i.estatusSat === "cancelado" && <Badge color="amber"><Ban className="size-3" /> Cancelado</Badge>}
                {i.deducible === "bloqueado_efos" && <Badge color="red"><ShieldX className="size-3" /> EFOS</Badge>}
                {i.deducible === "no_deducible" && <Badge color="red"><AlertTriangle className="size-3" /> No deducible</Badge>}
                {i.estadoPago === "pagada" ? (
                  <Badge color="green"><CheckCircle2 className="size-3" /> Pagada</Badge>
                ) : i.estadoPago === "programada" ? (
                  <Badge color="sky"><CalendarClock className="size-3" /> {i.fechaProgramada}</Badge>
                ) : (
                  <Badge color="slate">Pendiente</Badge>
                )}
              </div>
              <span className="tnum w-28 shrink-0 text-right text-sm font-extrabold">{mxn.format(i.total)}</span>
              <Button variant="secondary" onClick={() => abrirEditar(i)} className="px-3 py-2 text-xs">
                {i.estadoPago === "pagada" ? "Editar" : "Programar / pagar"}
              </Button>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Modal
        open={Boolean(editando)}
        onClose={() => setEditando(null)}
        title={editando ? `Pago a ${editando.emisorNombre || editando.emisorRfc}` : ""}
        subtitle={editando ? `${mxn.format(editando.total)} · ${editando.uuid}` : undefined}
      >
        {editando && (
          <div className="space-y-4">
            {editando.deducible !== "ok" && (
              <p className="rounded-xl bg-rose-50 p-3 text-xs font-medium leading-relaxed text-rose-700">
                ⚠ {editando.motivoNoDeducible ?? "Este CFDI tiene un problema fiscal."} Considera esto antes de pagar.
              </p>
            )}
            <Field label="Estado del pago">
              <Select value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)}>
                <option value="pendiente">Pendiente</option>
                <option value="programada">Programado</option>
                <option value="pagada">Pagado</option>
              </Select>
            </Field>
            {estadoPago === "programada" && (
              <Field label="Fecha programada">
                <Input type="date" value={fechaProg} onChange={(e) => setFechaProg(e.target.value)} />
              </Field>
            )}
            <Field label="Nota (opcional)">
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia, banco, autorización…" />
            </Field>
            <Button onClick={guardar} loading={guardando} className="w-full">
              Guardar
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
