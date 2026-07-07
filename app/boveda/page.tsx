"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, Search, UploadCloud, FileDown, ShieldX, Ban, AlertTriangle } from "lucide-react";
import { api, mxn } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, EmptyState, Select, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { CfdiDescargado } from "@/lib/types";

interface Resumen {
  total: number;
  emitidas: number;
  recibidas: number;
  cancelados: number;
  noDeducibles: number;
  efos: number;
}

const TABS = [
  { clave: "", label: "Todos" },
  { clave: "emitida", label: "Emitidos" },
  { clave: "recibida", label: "Recibidos" },
] as const;

const PROBLEMAS = [
  { clave: "", label: "Cualquier estatus" },
  { clave: "cancelado", label: "Cancelados en el SAT" },
  { clave: "no_deducible", label: "No deducibles" },
  { clave: "efos", label: "Proveedor en 69-B (EFOS)" },
];

// Etiqueta legible del tipo de comprobante (TipoDeComprobante del CFDI).
const TIPO_DOC: Record<string, string> = {
  I: "Ingreso",
  E: "Egreso",
  P: "Pago",
  N: "Nómina",
  T: "Traslado",
};

export default function BovedaPage() {
  const { toast } = useToast();
  const [datos, setDatos] = useState<{ cfdis: CfdiDescargado[]; resumen: Resumen } | null>(null);
  const [tipo, setTipo] = useState("");
  const [problema, setProblema] = useState("");
  const [q, setQ] = useState("");
  const [modalImportar, setModalImportar] = useState(false);
  const [tipoImportar, setTipoImportar] = useState<"recibida" | "emitida">("recibida");
  const [archivos, setArchivos] = useState<FileList | null>(null);
  const [importando, setImportando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (problema) params.set("problema", problema);
    if (q) params.set("q", q);
    setDatos(await api(`/api/boveda?${params}`));
  }, [tipo, problema, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      cargar().catch(() => setDatos({ cfdis: [], resumen: { total: 0, emitidas: 0, recibidas: 0, cancelados: 0, noDeducibles: 0, efos: 0 } }));
    }, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const importar = async () => {
    if (!archivos?.length) {
      toast("error", "Selecciona uno o más archivos XML");
      return;
    }
    setImportando(true);
    try {
      const form = new FormData();
      form.set("tipo", tipoImportar);
      for (const f of Array.from(archivos)) form.append("xml", f);
      const r = await api<{ resultados: { archivo: string; ok: boolean; deducible?: string; error?: string }[] }>(
        "/api/boveda/importar",
        { method: "POST", body: form },
      );
      const buenos = r.resultados.filter((x) => x.ok).length;
      const malos = r.resultados.filter((x) => !x.ok);
      toast("success", `${buenos} CFDI importados a la bóveda`);
      const marcados = r.resultados.filter((x) => x.ok && x.deducible !== "ok");
      if (marcados.length) {
        toast("info", "Atención fiscal", `${marcados.length} CFDI quedaron marcados (no deducibles o EFOS). Revisa las alertas.`);
      }
      for (const m of malos) toast("error", m.archivo, m.error);
      setModalImportar(false);
      setArchivos(null);
      await cargar();
    } catch (e) {
      toast("error", "No se pudo importar", e instanceof Error ? e.message : String(e));
    } finally {
      setImportando(false);
    }
  };

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await api<{ procesados: number; errores: number }>("/api/boveda/derivar", { method: "POST" });
      toast(
        "success",
        "Bóveda sincronizada",
        `${r.procesados} CFDI reflejados en clientes, productos, facturas y pagos.${r.errores ? ` (${r.errores} con error)` : ""}`,
      );
      await cargar();
    } catch (e) {
      toast("error", "No se pudo sincronizar", e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  };

  const chips = datos?.resumen;

  return (
    <div>
      <PageHeader
        title="Bóveda CFDI"
        subtitle="Todos los comprobantes descargados del SAT o importados, con su estatus y semáforo de deducibilidad."
        actions={
          <>
            <Button variant="secondary" onClick={sincronizar} loading={sincronizando}>
              <FileDown className="size-4" /> Sincronizar a operación
            </Button>
            <Button onClick={() => setModalImportar(true)}>
              <UploadCloud className="size-4" /> Importar XML
            </Button>
          </>
        }
      />

      {chips && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap gap-2">
          <Badge color="slate">{chips.total} en bóveda</Badge>
          <Badge color="brand">{chips.emitidas} emitidos</Badge>
          <Badge color="sky">{chips.recibidas} recibidos</Badge>
          {chips.cancelados > 0 && <Badge color="amber">{chips.cancelados} cancelados</Badge>}
          {chips.noDeducibles > 0 && <Badge color="red">{chips.noDeducibles} no deducibles</Badge>}
          {chips.efos > 0 && <Badge color="red">{chips.efos} EFOS</Badge>}
        </motion.div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.clave}
              onClick={() => setTipo(t.clave)}
              className={`relative rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${tipo === t.clave ? "text-white" : "text-ink-600 hover:text-ink-900"}`}
            >
              {tipo === t.clave && (
                <motion.span layoutId="boveda-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 shadow" />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
        <Select value={problema} onChange={(e) => setProblema(e.target.value)} className="max-w-56 py-2 text-xs">
          {PROBLEMAS.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.label}
            </option>
          ))}
        </Select>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9" placeholder="UUID, RFC o nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!datos ? (
        <Spinner label="Cargando bóveda…" />
      ) : datos.cfdis.length === 0 ? (
        <EmptyState
          icon={<Archive className="size-7" />}
          title="La bóveda está vacía"
          detail="Los CFDI llegan aquí desde la descarga masiva del SAT (manual o sincronización nocturna) o importando XMLs. Cada recibido pasa por validación EFOS 69-B y de deducibilidad."
          action={
            <Button onClick={() => setModalImportar(true)}>
              <UploadCloud className="size-4" /> Importar XML
            </Button>
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100 overflow-hidden">
          {datos.cfdis.map((c) => (
            <motion.div key={`${c.uuid}-${c.empresaId}`} variants={listItem} className="flex items-center gap-3 px-4 py-3">
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${c.tipo === "emitida" ? "bg-brand-100 text-brand-700" : "bg-sky-100 text-sky-700"}`}>
                {c.tipo === "emitida" ? "EMI" : "REC"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {c.tipo === "emitida" ? c.receptorNombre || c.receptorRfc : c.emisorNombre || c.emisorRfc}
                </p>
                <p className="mono truncate text-[11px] text-ink-400">{c.uuid}</p>
              </div>
              <div className="hidden shrink-0 text-right text-xs text-ink-600 md:block">
                <p>{c.fecha.slice(0, 10)}</p>
                <p className="text-[10px] text-ink-400">{c.formaPago ? `FP ${c.formaPago}` : ""}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {c.tipoComprobante && (
                  <Badge color="slate">{TIPO_DOC[c.tipoComprobante] ?? c.tipoComprobante}</Badge>
                )}
                {c.estatusSat === "cancelado" && (
                  <Badge color="amber"><Ban className="size-3" /> Cancelado</Badge>
                )}
                {c.deducible === "bloqueado_efos" && (
                  <Badge color="red"><ShieldX className="size-3" /> EFOS</Badge>
                )}
                {c.deducible === "no_deducible" && (
                  <Badge color="red"><AlertTriangle className="size-3" /> No deducible</Badge>
                )}
                {c.estatusSat === "vigente" && c.deducible === "ok" && <Badge color="green">OK</Badge>}
              </div>
              <span className="tnum w-24 shrink-0 text-right text-sm font-bold">{mxn.format(c.total)}</span>
              {c.xmlPath ? (
                <a
                  href={`/api/boveda/xml?uuid=${c.uuid}&empresaId=${c.empresaId}`}
                  className="shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-brand-50 hover:text-brand-600"
                  title="Descargar XML"
                >
                  <FileDown className="size-4" />
                </a>
              ) : (
                <span className="w-7 shrink-0 text-center text-[9px] text-ink-400" title="Solo metadata, sin XML">
                  meta
                </span>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      <Modal
        open={modalImportar}
        onClose={() => setModalImportar(false)}
        title="Importar XML a la bóveda"
        subtitle="Pasan por el mismo motor: EFOS 69-B, regla de $2,000 en efectivo y registro por empresa."
      >
        <div className="space-y-4">
          <Field label="¿Qué son estos CFDI?">
            <Select value={tipoImportar} onChange={(e) => setTipoImportar(e.target.value as "recibida" | "emitida")}>
              <option value="recibida">Recibidos (gastos / proveedores)</option>
              <option value="emitida">Emitidos (ingresos)</option>
            </Select>
          </Field>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center transition hover:border-brand-400">
            <UploadCloud className="size-7 text-brand-500" />
            <span className="text-sm font-semibold text-ink-900">
              {archivos?.length ? `${archivos.length} archivo(s) seleccionados` : "Elegir archivos XML"}
            </span>
            <span className="text-xs text-ink-400">Puedes seleccionar varios a la vez</span>
            <input type="file" accept=".xml,text/xml" multiple className="hidden" onChange={(e) => setArchivos(e.target.files)} />
          </label>
          <Button onClick={importar} loading={importando} className="w-full">
            Importar a la bóveda
          </Button>
        </div>
      </Modal>
    </div>
  );
}
