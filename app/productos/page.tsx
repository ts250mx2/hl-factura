"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Pencil, Trash2, Search } from "lucide-react";
import { api, postJson, putJson, ApiError, mxn } from "@/lib/client";
import { Button, Field, Input, Select, Modal, PageHeader, EmptyState, Badge, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CLAVES_PROD_SERV_COMUNES, CLAVES_UNIDAD, OBJETOS_IMP } from "@/lib/sat/catalogos";
import type { Producto } from "@/lib/types";

type IvaOpcion = "16" | "8" | "0" | "exento" | "na";

interface FormProducto {
  claveProdServ: string;
  claveUnidad: string;
  descripcion: string;
  valorUnitario: string;
  objetoImp: string;
  iva: IvaOpcion;
  retIva: boolean;
  retIsr: boolean;
  noIdentificacion: string;
}

const FORM_VACIO: FormProducto = {
  claveProdServ: "",
  claveUnidad: "E48",
  descripcion: "",
  valorUnitario: "",
  objetoImp: "02",
  iva: "16",
  retIva: false,
  retIsr: false,
  noIdentificacion: "",
};

function resumenImpuestos(p: Producto): string[] {
  const tags: string[] = [];
  if (p.objetoImp === "01") return ["No objeto de impuesto"];
  if (p.impuestos.ivaExento) tags.push("IVA exento");
  else if (p.impuestos.ivaTasa !== null) tags.push(`IVA ${(p.impuestos.ivaTasa * 100).toFixed(0)}%`);
  if (p.impuestos.retIvaTasa) tags.push(`Ret. IVA ${(p.impuestos.retIvaTasa * 100).toFixed(2).replace(/\.?0+$/, "")}%`);
  if (p.impuestos.retIsrTasa) tags.push(`Ret. ISR ${(p.impuestos.retIsrTasa * 100).toFixed(0)}%`);
  return tags.length ? tags : ["Sin impuestos"];
}

export default function ProductosPage() {
  const { toast } = useToast();
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);

  const cargar = useCallback(async () => {
    setProductos(await api<Producto[]>("/api/productos"));
  }, []);

  useEffect(() => {
    cargar().catch(() => setProductos([]));
  }, [cargar]);

  const filtrados = (productos ?? []).filter((p) => {
    const q = busqueda.toLowerCase();
    return !q || p.descripcion.toLowerCase().includes(q) || p.claveProdServ.includes(q);
  });

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setModal(true);
  };

  const abrirEditar = (p: Producto) => {
    setEditando(p);
    setForm({
      claveProdServ: p.claveProdServ,
      claveUnidad: p.claveUnidad,
      descripcion: p.descripcion,
      valorUnitario: String(p.valorUnitario),
      objetoImp: p.objetoImp,
      iva: p.impuestos.ivaExento
        ? "exento"
        : p.impuestos.ivaTasa === null
          ? "na"
          : ((p.impuestos.ivaTasa * 100).toFixed(0) as IvaOpcion),
      retIva: Boolean(p.impuestos.retIvaTasa),
      retIsr: Boolean(p.impuestos.retIsrTasa),
      noIdentificacion: p.noIdentificacion ?? "",
    });
    setModal(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const body = {
        claveProdServ: form.claveProdServ,
        claveUnidad: form.claveUnidad,
        descripcion: form.descripcion,
        valorUnitario: Number(form.valorUnitario),
        objetoImp: form.objetoImp,
        noIdentificacion: form.noIdentificacion,
        impuestos: {
          ivaTasa: form.iva === "exento" || form.iva === "na" ? null : Number(form.iva) / 100,
          ivaExento: form.iva === "exento",
          retIvaTasa: form.retIva ? 0.106667 : null,
          retIsrTasa: form.retIsr ? 0.1 : null,
          iepsTasa: null,
        },
      };
      if (editando) {
        await putJson(`/api/productos/${editando.id}`, body);
        toast("success", "Producto actualizado");
      } else {
        await postJson("/api/productos", body);
        toast("success", "Producto guardado", "Ya puedes usarlo al crear facturas.");
      }
      setModal(false);
      await cargar();
    } catch (e) {
      toast("error", "Revisa los datos", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p: Producto) => {
    if (!confirm(`¿Eliminar "${p.descripcion}"?`)) return;
    try {
      await api(`/api/productos/${p.id}`, { method: "DELETE" });
      toast("success", "Producto eliminado");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo eliminar", e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Productos y servicios"
        subtitle="Tu catálogo con claves del SAT e impuestos preconfigurados: factura en un par de clics."
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="size-4" /> Nuevo producto
          </Button>
        }
      />

      {productos && productos.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      )}

      {productos === null ? (
        <Spinner label="Cargando catálogo…" />
      ) : productos.length === 0 ? (
        <EmptyState
          icon={<Package className="size-7" />}
          title="Crea tu catálogo de productos y servicios"
          detail="Define una vez la clave SAT, unidad, precio e impuestos de lo que vendes, y reutilízalo en cada factura."
          action={
            <Button onClick={abrirNuevo}>
              <Plus className="size-4" /> Nuevo producto
            </Button>
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((p) => (
            <motion.div key={p.id} variants={listItem} whileHover={{ y: -2 }} className="card group p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-bold text-ink-900" title={p.descripcion}>
                  {p.descripcion}
                </p>
                <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => abrirEditar(p)} className="rounded-lg p-1.5 text-ink-400 hover:bg-slate-100 hover:text-brand-600">
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => eliminar(p)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <p className="tnum mt-1 text-xl font-extrabold text-brand-700">{mxn.format(p.valorUnitario)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge color="brand">
                  {p.claveProdServ}
                </Badge>
                <Badge color="slate">{p.claveUnidad}</Badge>
                {resumenImpuestos(p).map((t) => (
                  <Badge key={t} color="sky">
                    {t}
                  </Badge>
                ))}
                {p.origen === "descarga" && <Badge color="slate">Del SAT</Badge>}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editando ? "Editar producto" : "Nuevo producto o servicio"}
        subtitle="La clave de producto/servicio es del catálogo del SAT (8 dígitos)."
      >
        <div className="space-y-4">
          <Field label="Descripción">
            <Input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Servicio de desarrollo de software"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Clave producto/servicio SAT" hint="Escribe la tuya o elige una común.">
              <Input
                list="claves-comunes"
                value={form.claveProdServ}
                onChange={(e) => setForm({ ...form, claveProdServ: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                placeholder="81111500"
                className="mono"
              />
              <datalist id="claves-comunes">
                {CLAVES_PROD_SERV_COMUNES.map((c) => (
                  <option key={c.clave} value={c.clave}>
                    {c.descripcion}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Unidad SAT">
              <Select value={form.claveUnidad} onChange={(e) => setForm({ ...form, claveUnidad: e.target.value })}>
                {CLAVES_UNIDAD.map((u) => (
                  <option key={u.clave} value={u.clave}>
                    {u.clave} · {u.descripcion}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio unitario (sin IVA)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.valorUnitario}
                onChange={(e) => setForm({ ...form, valorUnitario: e.target.value })}
                placeholder="1500.00"
                className="tnum"
              />
            </Field>
            <Field label="Objeto de impuesto">
              <Select value={form.objetoImp} onChange={(e) => setForm({ ...form, objetoImp: e.target.value })}>
                {OBJETOS_IMP.slice(0, 3).map((o) => (
                  <option key={o.clave} value={o.clave}>
                    {o.clave} · {o.descripcion}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {form.objetoImp === "02" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-600">Impuestos</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="IVA">
                  <Select value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value as IvaOpcion })}>
                    <option value="16">16% (general)</option>
                    <option value="8">8% (frontera)</option>
                    <option value="0">0%</option>
                    <option value="exento">Exento</option>
                  </Select>
                </Field>
                <div className="flex flex-col justify-end gap-2 pb-0.5">
                  <label className="flex items-center gap-2 text-sm text-ink-900">
                    <input
                      type="checkbox"
                      checked={form.retIsr}
                      onChange={(e) => setForm({ ...form, retIsr: e.target.checked })}
                      className="size-4 accent-brand-600"
                    />
                    Retener ISR 10%
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink-900">
                    <input
                      type="checkbox"
                      checked={form.retIva}
                      onChange={(e) => setForm({ ...form, retIva: e.target.checked })}
                      className="size-4 accent-brand-600"
                    />
                    Retener IVA ⅔ (10.6667%)
                  </label>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                Las retenciones aplican típicamente cuando una persona física factura honorarios o
                arrendamiento a una persona moral.
              </p>
            </div>
          )}
          <Field label="No. identificación / SKU (opcional)">
            <Input
              value={form.noIdentificacion}
              onChange={(e) => setForm({ ...form, noIdentificacion: e.target.value })}
              placeholder="PROD-001"
            />
          </Field>
          <Button onClick={guardar} loading={guardando} className="w-full">
            {editando ? "Guardar cambios" : "Agregar al catálogo"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
