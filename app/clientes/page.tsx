"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Pencil, Trash2, Search, Mail } from "lucide-react";
import { api, postJson, putJson, ApiError } from "@/lib/client";
import { Button, Field, Input, Select, Modal, PageHeader, EmptyState, Badge, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { REGIMENES_FISCALES, usosPermitidos, USOS_CFDI } from "@/lib/sat/catalogos";
import { validarRfc, esPersonaMoral, esRfcGenerico, RFC_GENERICO_NACIONAL } from "@/lib/sat/rfc";
import type { Cliente } from "@/lib/types";

const FORM_VACIO = {
  rfc: "",
  nombre: "",
  regimenFiscal: "",
  codigoPostal: "",
  usoCfdi: "G03",
  email: "",
};

export default function ClientesPage() {
  const { toast } = useToast();
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  const cargar = useCallback(async () => {
    setClientes(await api<Cliente[]>("/api/clientes"));
  }, []);

  useEffect(() => {
    cargar().catch(() => setClientes([]));
  }, [cargar]);

  const rfc = form.rfc.trim().toUpperCase();
  const rfcInfo = validarRfc(rfc);
  const generico = esRfcGenerico(rfc);
  const moral = rfcInfo.valido && !generico && esPersonaMoral(rfc);

  const regimenes = REGIMENES_FISCALES.filter((r) =>
    !rfcInfo.valido || generico ? true : moral ? r.moral : r.fisica,
  );
  const usos = useMemo(() => {
    if (!form.regimenFiscal || generico) return USOS_CFDI.filter((u) => u.clave !== "CP01" && u.clave !== "CN01");
    return usosPermitidos(form.regimenFiscal, moral);
  }, [form.regimenFiscal, moral, generico]);

  const filtrados = (clientes ?? []).filter((c) => {
    const q = busqueda.toLowerCase();
    return !q || c.nombre.toLowerCase().includes(q) || c.rfc.toLowerCase().includes(q);
  });

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setModal(true);
  };

  const abrirEditar = (c: Cliente) => {
    setEditando(c);
    setForm({
      rfc: c.rfc,
      nombre: c.nombre,
      regimenFiscal: c.regimenFiscal,
      codigoPostal: c.codigoPostal,
      usoCfdi: c.usoCfdi,
      email: c.email ?? "",
    });
    setModal(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      if (editando) {
        await putJson(`/api/clientes/${editando.id}`, form);
        toast("success", "Cliente actualizado");
      } else {
        const res = await postJson<{ advertencias: string[] }>("/api/clientes", form);
        toast("success", "Cliente registrado", `${form.nombre} listo para recibir facturas.`);
        for (const a of res.advertencias ?? []) toast("info", "Advertencia", a);
      }
      setModal(false);
      await cargar();
    } catch (e) {
      toast("error", "Revisa los datos", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c: Cliente) => {
    if (!confirm(`¿Eliminar a ${c.nombre}?`)) return;
    try {
      await api(`/api/clientes/${c.id}`, { method: "DELETE" });
      toast("success", "Cliente eliminado");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo eliminar", e instanceof ApiError ? e.message : String(e));
    }
  };

  const usarPublicoGeneral = () => {
    setForm({
      ...FORM_VACIO,
      rfc: RFC_GENERICO_NACIONAL,
      nombre: "PUBLICO EN GENERAL",
      regimenFiscal: "616",
      usoCfdi: "S01",
    });
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Los receptores de tus facturas, con los datos de su Constancia de Situación Fiscal (CFDI 4.0 valida nombre, régimen y código postal)."
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="size-4" /> Nuevo cliente
          </Button>
        }
      />

      {clientes && clientes.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o RFC…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </motion.div>
      )}

      {clientes === null ? (
        <Spinner label="Cargando clientes…" />
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" />}
          title="Registra a tu primer cliente"
          detail="Con CFDI 4.0 el SAT valida que el nombre, régimen fiscal y código postal del receptor coincidan con su constancia. Captúralos bien una vez y factúrale siempre en segundos."
          action={
            <Button onClick={abrirNuevo}>
              <Plus className="size-4" /> Nuevo cliente
            </Button>
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((c) => (
            <motion.div key={c.id} variants={listItem} whileHover={{ y: -2 }} className="card group p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink-900">{c.nombre}</p>
                  <p className="mono text-xs text-ink-600">{c.rfc}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => abrirEditar(c)} className="rounded-lg p-1.5 text-ink-400 hover:bg-slate-100 hover:text-brand-600">
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => eliminar(c)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge color="brand">Régimen {c.regimenFiscal}</Badge>
                <Badge color="sky">Uso {c.usoCfdi}</Badge>
                <Badge color="slate">CP {c.codigoPostal}</Badge>
              </div>
              {c.email && (
                <p className="mt-2.5 flex items-center gap-1.5 truncate text-xs text-ink-600">
                  <Mail className="size-3.5 shrink-0" /> {c.email}
                </p>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editando ? `Editar a ${editando.nombre}` : "Nuevo cliente"}
        subtitle="Copia los datos de la Constancia de Situación Fiscal del cliente."
      >
        <div className="space-y-4">
          {!editando && (
            <button
              onClick={usarPublicoGeneral}
              className="w-full rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              ⚡ Venta al público en general (RFC {RFC_GENERICO_NACIONAL})
            </button>
          )}
          <Field label="RFC" error={form.rfc && !rfcInfo.valido ? rfcInfo.errores[0] : undefined} hint={rfcInfo.advertencias[0]}>
            <Input
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              placeholder="XAXX010101000"
              maxLength={13}
              className="mono uppercase"
            />
          </Field>
          <Field label="Nombre / razón social" hint="En mayúsculas y sin régimen de capital (sin 'SA DE CV').">
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })}
              placeholder="JUAN PEREZ LOPEZ"
            />
          </Field>
          {!generico && (
            <Field label="Régimen fiscal del cliente">
              <Select value={form.regimenFiscal} onChange={(e) => setForm({ ...form, regimenFiscal: e.target.value, usoCfdi: "" })}>
                <option value="">Selecciona…</option>
                {regimenes.map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.clave} · {r.descripcion}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal fiscal">
              <Input
                value={form.codigoPostal}
                onChange={(e) => setForm({ ...form, codigoPostal: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                placeholder="06600"
                inputMode="numeric"
              />
            </Field>
            {!generico && (
              <Field label="Uso CFDI habitual">
                <Select value={form.usoCfdi} onChange={(e) => setForm({ ...form, usoCfdi: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {usos.map((u) => (
                    <option key={u.clave} value={u.clave}>
                      {u.clave} · {u.descripcion}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Correo (opcional)" hint="Para enviarle sus facturas.">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="cliente@correo.com"
            />
          </Field>
          <Button onClick={guardar} loading={guardando} className="w-full">
            {editando ? "Guardar cambios" : "Registrar cliente"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
