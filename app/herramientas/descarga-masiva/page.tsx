"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CloudDownload, Plus, RefreshCcw, PackageOpen, FileDown } from "lucide-react";
import { api, postJson, ApiError, fechaLarga } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSesion } from "@/components/session-provider";
import type { Emisor, SolicitudDescarga } from "@/lib/types";

const ESTADOS: Record<string, { color: "green" | "red" | "amber" | "slate" | "brand" | "sky"; label: string }> = {
  solicitada: { color: "sky", label: "Solicitada" },
  en_proceso: { color: "amber", label: "En proceso en el SAT" },
  lista: { color: "brand", label: "Paquetes listos" },
  descargada: { color: "green", label: "Descargada" },
  error: { color: "red", label: "Error" },
  rechazada: { color: "red", label: "Rechazada / expirada" },
};

interface Contenido {
  formato: "xml" | "metadata";
  archivos: { nombre: string; contenido?: string }[];
  metadata: Record<string, string>[];
}

export default function DescargaMasivaPage() {
  const { toast } = useToast();
  const { sesion } = useSesion();
  const [solicitudes, setSolicitudes] = useState<SolicitudDescarga[] | null>(null);
  const [emisores, setEmisores] = useState<Emisor[]>([]);
  const [modal, setModal] = useState(false);
  const [creando, setCreando] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [contenido, setContenido] = useState<{ id: string; data: Contenido } | null>(null);

  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    tipo: "emitidas",
    formato: "xml",
    fechaInicio: hace30,
    fechaFin: hoy,
  });

  const cargar = useCallback(async () => {
    const [s, e] = await Promise.all([api<SolicitudDescarga[]>("/api/descargas"), api<Emisor[]>("/api/emisores")]);
    setSolicitudes(s);
    setEmisores(e);
  }, []);

  useEffect(() => {
    cargar().catch(() => setSolicitudes([]));
  }, [cargar]);

  const crear = async () => {
    setCreando(true);
    try {
      await postJson("/api/descargas", form);
      toast("success", "Solicitud presentada al SAT", "El SAT prepara los paquetes; verifica en unos minutos.");
      setModal(false);
      await cargar();
    } catch (e) {
      toast("error", "El SAT no aceptó la solicitud", e instanceof ApiError ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  };

  const verificar = async (s: SolicitudDescarga) => {
    setTrabajando(s.id);
    try {
      const r = await postJson<SolicitudDescarga>(`/api/descargas/${s.id}/verificar`, {});
      toast(r.estado === "lista" ? "success" : "info", r.mensaje ?? "Verificado");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo verificar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setTrabajando(null);
    }
  };

  const descargar = async (s: SolicitudDescarga) => {
    setTrabajando(s.id);
    try {
      const r = await postJson<{ errores: { error?: string }[] }>(`/api/descargas/${s.id}/descargar`, {});
      if (r.errores?.length) toast("error", "Algunos paquetes fallaron", r.errores.map((x) => x.error).join("\n"));
      else toast("success", "Paquetes descargados", "Ya puedes explorar su contenido.");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo descargar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setTrabajando(null);
    }
  };

  const explorar = async (s: SolicitudDescarga) => {
    setTrabajando(s.id);
    try {
      const data = await api<Contenido>(`/api/descargas/${s.id}/contenido`);
      setContenido({ id: s.id, data });
    } catch (e) {
      toast("error", "No se pudo leer el paquete", e instanceof ApiError ? e.message : String(e));
    } finally {
      setTrabajando(null);
    }
  };

  const descargarXmlLocal = (nombre: string, xml: string) => {
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Igual que el resto de la app: solo se opera la empresa activa ("Trabajando en").
  const empresaActiva = emisores.find((e) => e.id === sesion?.empresaActivaId) ?? null;
  const fielLista = Boolean(empresaActiva?.fiel);

  return (
    <div>
      <PageHeader
        title="Descarga masiva del SAT"
        subtitle={`Recupera los XML emitidos o recibidos directamente del SAT usando la FIEL (e.firma). Se muestran solo las solicitudes de ${empresaActiva ? `${empresaActiva.nombre} (${empresaActiva.rfc})` : "la empresa activa"}.`}
        actions={
          <Button onClick={() => setModal(true)}>
            <Plus className="size-4" /> Nueva solicitud
          </Button>
        }
      />

      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs leading-relaxed text-sky-900">
        <b>¿Cómo funciona?</b> 1) Presentas la solicitud firmada con tu FIEL → 2) el SAT la procesa (minutos u
        horas) → 3) verificas hasta que estén listos los paquetes → 4) los descargas y exploras aquí mismo.
      </div>

      {solicitudes === null ? (
        <Spinner label="Cargando solicitudes…" />
      ) : solicitudes.length === 0 ? (
        <EmptyState
          icon={<CloudDownload className="size-7" />}
          title={`Sin solicitudes de ${empresaActiva ? empresaActiva.nombre : "esta empresa"}`}
          detail={
            !fielLista
              ? "La empresa activa no tiene FIEL (e.firma) cargada. Súbela en la sección Emisores; el SAT la requiere para autenticar la descarga."
              : "Solicita los CFDI emitidos o recibidos de cualquier periodo. Para otra empresa, cámbiala en «Trabajando en»."
          }
          action={
            !fielLista ? (
              <Link href="/emisores">
                <Button variant="secondary">Ir a Emisores</Button>
              </Link>
            ) : (
              <Button onClick={() => setModal(true)}>
                <Plus className="size-4" /> Nueva solicitud
              </Button>
            )
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-3">
          {solicitudes.map((s) => {
            const estado = ESTADOS[s.estado] ?? ESTADOS.error;
            return (
              <motion.div key={s.id} variants={listItem} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">
                        {s.tipo === "emitidas" ? "Emitidas" : "Recibidas"} · {s.formato.toUpperCase()} · {s.emisorRfc}
                      </p>
                      <Badge color={estado.color}>{estado.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-600">
                      Periodo {s.fechaInicio} → {s.fechaFin} · {s.paquetes.length} paquete(s)
                    </p>
                    {s.mensaje && <p className="mt-1 text-xs text-ink-400">{s.mensaje}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(s.estado === "solicitada" || s.estado === "en_proceso") && (
                      <Button variant="secondary" onClick={() => verificar(s)} loading={trabajando === s.id}>
                        <RefreshCcw className="size-4" /> Verificar
                      </Button>
                    )}
                    {s.estado === "lista" && (
                      <Button onClick={() => descargar(s)} loading={trabajando === s.id}>
                        <CloudDownload className="size-4" /> Descargar paquetes
                      </Button>
                    )}
                    {s.estado === "descargada" && (
                      <Button variant="secondary" onClick={() => explorar(s)} loading={trabajando === s.id}>
                        <PackageOpen className="size-4" /> Explorar contenido
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-ink-400">
                  Solicitud {s.requestId ?? "—"} · actualizada {fechaLarga(s.actualizadoEl)}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Modal nueva solicitud */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nueva solicitud de descarga"
        subtitle="Se firma con la FIEL del emisor y se presenta al servicio oficial del SAT."
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold">
              {empresaActiva ? `${empresaActiva.nombre} · ${empresaActiva.rfc}` : "Sin empresa activa"}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">
              La solicitud se presenta a nombre de la empresa activa. Para otra empresa, cámbiala en «Trabajando en».
            </p>
          </div>
          {!fielLista && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800">
              La empresa activa no tiene FIEL cargada. Súbela en Emisores → Administrar certificados.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="emitidas">CFDI emitidos</option>
                <option value="recibidas">CFDI recibidos</option>
              </Select>
            </Field>
            <Field label="Formato">
              <Select value={form.formato} onChange={(e) => setForm({ ...form, formato: e.target.value })}>
                <option value="xml">XML completos</option>
                <option value="metadata">Solo metadata (más rápido)</option>
              </Select>
            </Field>
            <Field label="Desde">
              <Input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} />
            </Field>
          </div>
          {form.tipo === "recibidas" && form.formato === "xml" && (
            <p className="rounded-lg bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
              El SAT solo entrega el XML de los CFDI recibidos <b>vigentes</b>. Si también quieres ver los
              cancelados de tus proveedores, usa el formato «Solo metadata».
            </p>
          )}
          <Button onClick={crear} loading={creando} className="w-full" disabled={!empresaActiva || !fielLista}>
            <CloudDownload className="size-4" /> Presentar solicitud al SAT
          </Button>
        </div>
      </Modal>

      {/* Modal contenido */}
      <Modal
        open={Boolean(contenido)}
        onClose={() => setContenido(null)}
        title="Contenido de los paquetes"
        subtitle={contenido?.data.formato === "xml" ? `${contenido.data.archivos.length} CFDI` : `${contenido?.data.metadata.length ?? 0} registros`}
        wide
      >
        {contenido?.data.formato === "xml" ? (
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {contenido.data.archivos.map((a) => (
              <div key={a.nombre} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <span className="mono truncate text-xs">{a.nombre}</span>
                {a.contenido && (
                  <button onClick={() => descargarXmlLocal(a.nombre, a.contenido!)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                    <FileDown className="size-3.5" /> Guardar
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-ink-400">
                  <th className="p-2">UUID</th>
                  <th className="p-2">Emisor</th>
                  <th className="p-2">Receptor</th>
                  <th className="p-2">Fecha</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {contenido?.data.metadata.map((m) => (
                  <tr key={m.uuid} className="border-b border-slate-100">
                    <td className="mono p-2 text-[10px]">{m.uuid}</td>
                    <td className="p-2">{m.rfcEmisor}</td>
                    <td className="p-2">{m.rfcReceptor}</td>
                    <td className="p-2">{m.fechaEmision}</td>
                    <td className="tnum p-2 text-right">{m.monto}</td>
                    <td className="p-2">{m.estatus === "1" ? "Vigente" : "Cancelado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
