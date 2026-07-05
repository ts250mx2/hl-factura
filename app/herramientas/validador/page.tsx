"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldX, ShieldAlert, UploadCloud, FileSearch } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Button, PageHeader, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";

interface Reporte {
  version: string;
  esCfdi40: boolean;
  emisor: { rfc: string; nombre: string; regimen: string };
  receptor: { rfc: string; nombre: string; usoCfdi: string };
  serie?: string;
  folio?: string;
  fecha: string;
  total: string;
  moneda: string;
  tipoDeComprobante: string;
  conceptos: { descripcion: string; cantidad: string; importe: string }[];
  timbrado: boolean;
  uuid?: string;
  fechaTimbrado?: string;
  rfcProvCertif?: string;
  selloVerificable: boolean;
  selloValido?: boolean;
  motivoNoVerificable?: string;
  advertencias: string[];
}

interface Resultado {
  reporte: Reporte;
  estatusSat: {
    codigoEstatus: string;
    estado: string;
    esCancelable: string;
    estatusCancelacion: string;
    validacionEfos: string;
  } | null;
  errorSat: string | null;
}

export default function ValidadorPage() {
  const { toast } = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [consultarSat, setConsultarSat] = useState(true);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const validar = async (file?: File) => {
    const xml = file ?? archivo;
    if (!xml) return;
    setValidando(true);
    setResultado(null);
    try {
      const form = new FormData();
      form.set("xml", xml);
      form.set("consultarSat", consultarSat ? "1" : "0");
      setResultado(await api<Resultado>("/api/validador", { method: "POST", body: form }));
    } catch (e) {
      toast("error", "No se pudo validar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setValidando(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Validador de CFDI"
        subtitle="Sube cualquier XML: se revisa su estructura, se verifica el sello digital criptográficamente y se consulta su estatus real en el SAT."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const file = e.dataTransfer.files?.[0];
          if (file) {
            setArchivo(file);
            validar(file);
          }
        }}
        className={`card flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition ${
          arrastrando ? "border-brand-500 bg-brand-50/60" : "border-slate-200"
        }`}
      >
        <motion.div animate={arrastrando ? { scale: 1.15 } : { scale: 1 }} className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-violet-100 text-brand-600">
          <UploadCloud className="size-7" />
        </motion.div>
        <p className="font-bold">Arrastra aquí el XML de un CFDI</p>
        <p className="text-sm text-ink-600">o</p>
        <label className="cursor-pointer">
          <span className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-sm transition hover:border-brand-300">
            Elegir archivo…
          </span>
          <input
            type="file"
            accept=".xml,text/xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setArchivo(file);
              if (file) validar(file);
            }}
          />
        </label>
        {archivo && <p className="mono text-xs text-ink-600">{archivo.name}</p>}
        <label className="mt-1 flex items-center gap-2 text-xs font-medium text-ink-600">
          <input type="checkbox" checked={consultarSat} onChange={(e) => setConsultarSat(e.target.checked)} className="size-3.5 accent-brand-600" />
          Consultar también el estatus en el SAT (requiere internet)
        </label>
        {archivo && (
          <Button onClick={() => validar()} loading={validando}>
            <FileSearch className="size-4" /> Validar de nuevo
          </Button>
        )}
      </div>

      {resultado && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
          {/* Veredicto del sello */}
          <div
            className={`card flex items-center gap-4 p-5 ${
              resultado.reporte.selloVerificable
                ? resultado.reporte.selloValido
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-rose-200 bg-rose-50/50"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            {resultado.reporte.selloVerificable ? (
              resultado.reporte.selloValido ? (
                <ShieldCheck className="size-10 shrink-0 text-emerald-600" />
              ) : (
                <ShieldX className="size-10 shrink-0 text-rose-600" />
              )
            ) : (
              <ShieldAlert className="size-10 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-base font-extrabold">
                {resultado.reporte.selloVerificable
                  ? resultado.reporte.selloValido
                    ? "Sello digital VÁLIDO"
                    : "Sello digital INVÁLIDO"
                  : "Sello no verificable localmente"}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                {resultado.reporte.selloVerificable
                  ? resultado.reporte.selloValido
                    ? "La cadena original reconstruida coincide criptográficamente con el sello y el certificado del emisor."
                    : "El sello NO corresponde al contenido del XML: el comprobante pudo ser alterado."
                  : resultado.reporte.motivoNoVerificable}
              </p>
            </div>
          </div>

          {/* Estatus SAT */}
          {resultado.estatusSat && (
            <div className="card p-5">
              <p className="mb-3 text-sm font-bold">Estatus en el SAT</p>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-ink-400">Estado</p>
                  <p className={`font-bold ${resultado.estatusSat.estado === "Vigente" ? "text-emerald-700" : resultado.estatusSat.estado === "Cancelado" ? "text-rose-600" : ""}`}>
                    {resultado.estatusSat.estado || "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-ink-400">Cancelable</p>
                  <p className="font-bold">{resultado.estatusSat.esCancelable || "—"}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-ink-400">Estatus cancelación</p>
                  <p className="font-bold">{resultado.estatusSat.estatusCancelacion}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-ink-400">EFOS (69-B)</p>
                  <p className="font-bold">{resultado.estatusSat.validacionEfos}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-400">{resultado.estatusSat.codigoEstatus}</p>
            </div>
          )}
          {resultado.errorSat && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No se pudo consultar al SAT: {resultado.errorSat}
            </div>
          )}

          {/* Datos del comprobante */}
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold">Datos del comprobante</p>
              <Badge color="brand">CFDI {resultado.reporte.version}</Badge>
              <Badge color={resultado.reporte.timbrado ? "green" : "amber"}>
                {resultado.reporte.timbrado ? "Timbrado" : "Sin timbrar"}
              </Badge>
              <Badge color="slate">Tipo {resultado.reporte.tipoDeComprobante}</Badge>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Emisor</p>
                <p className="font-bold">{resultado.reporte.emisor.nombre}</p>
                <p className="mono text-xs">{resultado.reporte.emisor.rfc} · Régimen {resultado.reporte.emisor.regimen}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Receptor</p>
                <p className="font-bold">{resultado.reporte.receptor.nombre}</p>
                <p className="mono text-xs">{resultado.reporte.receptor.rfc} · Uso {resultado.reporte.receptor.usoCfdi}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div><dt className="text-ink-400">Folio</dt><dd className="font-semibold">{resultado.reporte.serie ?? ""}-{resultado.reporte.folio ?? "s/f"}</dd></div>
              <div><dt className="text-ink-400">Fecha</dt><dd className="font-semibold">{resultado.reporte.fecha.replace("T", " ")}</dd></div>
              <div><dt className="text-ink-400">Total</dt><dd className="tnum font-semibold">${resultado.reporte.total} {resultado.reporte.moneda}</dd></div>
              {resultado.reporte.uuid && (
                <div className="col-span-2 md:col-span-1"><dt className="text-ink-400">UUID</dt><dd className="mono break-all font-semibold">{resultado.reporte.uuid}</dd></div>
              )}
            </dl>
            {resultado.reporte.conceptos.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-100">
                {resultado.reporte.conceptos.map((c, i) => (
                  <div key={i} className="flex justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-0">
                    <span className="truncate">{c.cantidad} × {c.descripcion}</span>
                    <span className="tnum shrink-0 font-semibold">${c.importe}</span>
                  </div>
                ))}
              </div>
            )}
            {resultado.reporte.advertencias.length > 0 && (
              <ul className="mt-3 space-y-1">
                {resultado.reporte.advertencias.map((a, i) => (
                  <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
