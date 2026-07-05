"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserCog, Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { api, postJson, putJson, ApiError, fechaCorta } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSesion } from "@/components/session-provider";
import type { Usuario, Rol } from "@/lib/types";

const ROLES: { valor: Rol; label: string; detalle: string }[] = [
  { valor: "admin", label: "Administrador", detalle: "Todo el despacho: empresas, usuarios, configuración PAC." },
  { valor: "supervisor", label: "Contador supervisor", detalle: "Opera todas las empresas; no administra usuarios ni PAC." },
  { valor: "auxiliar", label: "Auxiliar contable", detalle: "Solo las empresas (RFCs) que le asignes." },
  { valor: "cliente", label: "Cliente final", detalle: "Solo su propia empresa: factura y consulta." },
];

const ROL_BADGE: Record<Rol, "brand" | "sky" | "amber" | "green"> = {
  admin: "brand",
  supervisor: "sky",
  auxiliar: "amber",
  cliente: "green",
};

interface FormUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
  empresaIds: string[];
}

const FORM_VACIO: FormUsuario = { nombre: "", email: "", password: "", rol: "auxiliar", empresaIds: [] };

export default function UsuariosPage() {
  const { toast } = useToast();
  const { sesion } = useSesion();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState<FormUsuario>(FORM_VACIO);

  const cargar = useCallback(async () => {
    setUsuarios(await api<Usuario[]>("/api/usuarios"));
  }, []);

  useEffect(() => {
    cargar().catch(() => setUsuarios([]));
  }, [cargar]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setModal(true);
  };

  const abrirEditar = (u: Usuario) => {
    setEditando(u);
    setForm({ nombre: u.nombre, email: u.email, password: "", rol: u.rol, empresaIds: u.empresaIds });
    setModal(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      if (editando) {
        await putJson(`/api/usuarios/${editando.id}`, form);
        toast("success", "Usuario actualizado");
      } else {
        await postJson("/api/usuarios", form);
        toast("success", "Usuario creado", `${form.nombre} ya puede iniciar sesión con ${form.email}.`);
      }
      setModal(false);
      await cargar();
    } catch (e) {
      toast("error", "Revisa los datos", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (u: Usuario) => {
    if (!confirm(`¿Eliminar la cuenta de ${u.nombre}?`)) return;
    try {
      await api(`/api/usuarios/${u.id}`, { method: "DELETE" });
      toast("success", "Usuario eliminado");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo eliminar", e instanceof ApiError ? e.message : String(e));
    }
  };

  const alternarActivo = async (u: Usuario) => {
    try {
      await putJson(`/api/usuarios/${u.id}`, { activo: !u.activo });
      toast("success", u.activo ? "Cuenta desactivada" : "Cuenta reactivada");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo cambiar", e instanceof ApiError ? e.message : String(e));
    }
  };

  const requiereEmpresas = form.rol === "auxiliar" || form.rol === "cliente";
  const empresas = sesion?.empresas ?? [];

  return (
    <div>
      <PageHeader
        title="Usuarios del despacho"
        subtitle="Controla quién entra y qué puede ver: cada auxiliar o cliente final solo accede a los RFCs que le asignes."
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="size-4" /> Nuevo usuario
          </Button>
        }
      />

      {usuarios === null ? (
        <Spinner label="Cargando usuarios…" />
      ) : usuarios.length === 0 ? (
        <EmptyState icon={<UserCog className="size-7" />} title="Sin usuarios" detail="Crea cuentas para tu equipo y tus clientes." />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100">
          {usuarios.map((u) => (
            <motion.div key={u.id} variants={listItem} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-sm font-extrabold text-white">
                {u.nombre.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-ink-900">{u.nombre}</p>
                  <Badge color={ROL_BADGE[u.rol]}>{ROLES.find((r) => r.valor === u.rol)?.label}</Badge>
                  {!u.activo && <Badge color="red">Desactivado</Badge>}
                  {u.id === sesion?.usuario.id && <Badge color="slate">Tú</Badge>}
                </div>
                <p className="text-xs text-ink-600">{u.email} · desde {fechaCorta(u.creadoEl)}</p>
                {(u.rol === "auxiliar" || u.rol === "cliente") && (
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    Acceso a:{" "}
                    {u.empresaIds.length
                      ? u.empresaIds
                          .map((id) => empresas.find((e) => e.id === id)?.rfc ?? "?")
                          .join(", ")
                      : "ninguna empresa"}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {u.id !== sesion?.usuario.id && (
                  <button
                    onClick={() => alternarActivo(u)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${u.activo ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                  >
                    {u.activo ? "Desactivar" : "Reactivar"}
                  </button>
                )}
                <button onClick={() => abrirEditar(u)} className="rounded-lg p-1.5 text-ink-400 hover:bg-slate-100 hover:text-brand-600">
                  <Pencil className="size-4" />
                </button>
                {u.id !== sesion?.usuario.id && (
                  <button onClick={() => eliminar(u)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editando ? `Editar a ${editando.nombre}` : "Nuevo usuario"}
        subtitle="Define su rol y, si aplica, las empresas a las que tendrá acceso."
      >
        <div className="space-y-4">
          <Field label="Nombre">
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" />
          </Field>
          {!editando && (
            <Field label="Correo (será su usuario)">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@correo.com" />
            </Field>
          )}
          <Field label={editando ? "Nueva contraseña (deja vacío para no cambiarla)" : "Contraseña"} hint="Mínimo 8 caracteres.">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
          </Field>
          <Field label="Rol">
            <Select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
              {ROLES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.label}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-400">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              {ROLES.find((r) => r.valor === form.rol)?.detalle}
            </p>
          </Field>
          {requiereEmpresas && (
            <Field label="Empresas (RFCs) con acceso">
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2.5">
                {empresas.length === 0 && <p className="text-xs text-ink-400">Primero registra empresas en Empresas / RFCs.</p>}
                {empresas.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={form.empresaIds.includes(e.id)}
                      onChange={(ev) =>
                        setForm({
                          ...form,
                          empresaIds: ev.target.checked
                            ? [...form.empresaIds, e.id]
                            : form.empresaIds.filter((x) => x !== e.id),
                        })
                      }
                      className="size-4 accent-brand-600"
                    />
                    <span className="mono text-xs font-semibold">{e.rfc}</span>
                    <span className="truncate text-xs text-ink-600">{e.nombre}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
          <Button onClick={guardar} loading={guardando} className="w-full">
            {editando ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
