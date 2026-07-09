"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Plus,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  KeyRound,
  Trash2,
  FileKey2,
  UploadCloud,
  CloudDownload,
  FileText,
} from "lucide-react";
import { api, postJson, ApiError, fechaCorta } from "@/lib/client";
import { Button, Field, Input, Select, Modal, PageHeader, EmptyState, Badge, Spinner, listContainer, listItem } from "@/components/ui";
import { useToast } from "@/components/toast";
import { REGIMENES_FISCALES } from "@/lib/sat/catalogos";
import { validarRfc, esPersonaMoral } from "@/lib/sat/rfc";
import type { Emisor, CertificadoInfo } from "@/lib/types";

function ChipCertificado({ cert, tipo }: { cert?: CertificadoInfo | null; tipo: "CSD" | "FIEL" }) {
  if (!cert) {
    return (
      <Badge color="slate">
        <ShieldQuestion className="size-3" /> {tipo} pendiente
      </Badge>
    );
  }
  const dias = Math.floor((new Date(cert.validoHasta).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) {
    return (
      <Badge color="red">
        <ShieldAlert className="size-3" /> {tipo} vencido
      </Badge>
    );
  }
  if (dias < 90) {
    return (
      <Badge color="amber">
        <ShieldAlert className="size-3" /> {tipo} vence en {dias} d
      </Badge>
    );
  }
  return (
    <Badge color="green">
      <ShieldCheck className="size-3" /> {tipo} vigente
    </Badge>
  );
}

function FormularioCertificado({
  emisor,
  tipo,
  onDone,
}: {
  emisor: Emisor;
  tipo: "csd" | "fiel";
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [cer, setCer] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const cert = tipo === "csd" ? emisor.csd : emisor.fiel;
  const titulo = tipo === "csd" ? "CSD · Certificado de Sello Digital" : "FIEL · e.firma";
  const descripcion =
    tipo === "csd"
      ? "Con él se sellan tus CFDI. Lo tramitas en el portal del SAT (Certifica)."
      : "Se usa para la descarga masiva de tus CFDI directamente del SAT.";

  const subir = async () => {
    if (!cer || !key || !password) {
      toast("error", "Faltan datos", "Selecciona el .cer, el .key y escribe la contraseña de la llave.");
      return;
    }
    setSubiendo(true);
    try {
      const form = new FormData();
      form.set("tipo", tipo);
      form.set("cer", cer);
      form.set("key", key);
      form.set("password", password);
      const res = await api<{ advertencias: string[] }>(`/api/emisores/${emisor.id}/certificado`, {
        method: "POST",
        body: form,
      });
      toast("success", `${tipo.toUpperCase()} cargado y validado`, "La llave y el certificado corresponden y la contraseña es correcta.");
      for (const adv of res.advertencias) toast("info", "Advertencia", adv);
      setCer(null);
      setKey(null);
      setPassword("");
      onDone();
    } catch (e) {
      toast("error", "No se pudo cargar el certificado", e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <FileKey2 className="size-4 text-brand-600" /> {titulo}
          </p>
          <p className="mt-0.5 text-xs text-ink-600">{descripcion}</p>
        </div>
        <ChipCertificado cert={cert} tipo={tipo === "csd" ? "CSD" : "FIEL"} />
      </div>

      {cert && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-white p-3 text-xs">
          <div>
            <p className="text-ink-400">No. certificado</p>
            <p className="mono font-semibold text-ink-900">{cert.noCertificado}</p>
          </div>
          <div>
            <p className="text-ink-400">Vigencia</p>
            <p className="font-semibold text-ink-900">
              {fechaCorta(cert.validoDesde)} → {fechaCorta(cert.validoHasta)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-ink-400">Titular</p>
            <p className="font-semibold text-ink-900">{cert.nombre || cert.rfc}</p>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs font-medium transition ${cer ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-ink-600 hover:border-brand-400"}`}>
          <UploadCloud className="size-4 shrink-0" />
          <span className="truncate">{cer ? cer.name : "Archivo .cer"}</span>
          <input type="file" accept=".cer,.pem,.crt" className="hidden" onChange={(e) => setCer(e.target.files?.[0] ?? null)} />
        </label>
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs font-medium transition ${key ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-ink-600 hover:border-brand-400"}`}>
          <KeyRound className="size-4 shrink-0" />
          <span className="truncate">{key ? key.name : "Archivo .key"}</span>
          <input type="file" accept=".key,.pem" className="hidden" onChange={(e) => setKey(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          type="password"
          placeholder="Contraseña de la llave privada"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button onClick={subir} loading={subiendo} className="shrink-0">
          {cert ? "Reemplazar" : "Cargar"}
        </Button>
      </div>
    </div>
  );
}

export default function EmisoresPage() {
  const { toast } = useToast();
  const [emisores, setEmisores] = useState<Emisor[] | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [certifica, setCertifica] = useState<Emisor | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ rfc: "", nombre: "", regimenFiscal: "", codigoPostal: "", serie: "A" });
  const [csfFile, setCsfFile] = useState<File | null>(null);
  const [parsingCsf, setParsingCsf] = useState(false);
  const [csfSat, setCsfSat] = useState<string | null>(null);
  const [opinionSat, setOpinionSat] = useState<string | null>(null);
  const [diagCsf, setDiagCsf] = useState<{ error?: string; pasos: { paso: string; url?: string; status?: number; detalle?: string }[] } | null>(null);

  const cargar = useCallback(async () => {
    const data = await api<Emisor[]>("/api/emisores");
    setEmisores(data);
    setCertifica((actual) => (actual ? data.find((e) => e.id === actual.id) ?? null : null));
  }, []);

  useEffect(() => {
    cargar().catch(() => setEmisores([]));
  }, [cargar]);

  const rfcInfo = validarRfc(form.rfc);
  const regimenesFiltrados = REGIMENES_FISCALES.filter((r) => {
    if (!rfcInfo.valido || rfcInfo.tipo === "generico") return true;
    return esPersonaMoral(form.rfc.trim().toUpperCase()) ? r.moral : r.fisica;
  });

  const cerrarModal = () => {
    setModalNuevo(false);
    setForm({ rfc: "", nombre: "", regimenFiscal: "", codigoPostal: "", serie: "A" });
    setCsfFile(null);
  };

  const rellenarDesdeCsf = async (file: File) => {
    setParsingCsf(true);
    try {
      const fd = new FormData();
      fd.set("archivo", file);
      const d = await api<{ rfc: string; nombre: string; codigoPostal: string; regimenFiscal: string; regimenes: { clave: string }[]; obligaciones: number }>(
        "/api/emisores/parse-csf",
        { method: "POST", body: fd },
      );
      setForm({ rfc: d.rfc, nombre: d.nombre, regimenFiscal: d.regimenFiscal, codigoPostal: d.codigoPostal, serie: "A" });
      setCsfFile(file);
      toast(
        "success",
        "Datos tomados de la Constancia",
        `${d.regimenes.length} régimen(es) y ${d.obligaciones} obligación(es) detectadas; se guardarán al crear la empresa.`,
      );
    } catch (e) {
      toast("error", "No se pudo leer la CSF", e instanceof ApiError ? e.message : String(e));
    } finally {
      setParsingCsf(false);
    }
  };

  const crear = async () => {
    setGuardando(true);
    try {
      if (csfFile) {
        const fd = new FormData();
        fd.set("archivo", csfFile);
        fd.set("rfc", form.rfc);
        fd.set("nombre", form.nombre);
        fd.set("regimenFiscal", form.regimenFiscal);
        fd.set("codigoPostal", form.codigoPostal);
        fd.set("serie", form.serie);
        const r = await api<{ regimenes: number; obligaciones: number }>("/api/emisores/desde-csf", { method: "POST", body: fd });
        toast("success", "Empresa creada desde la CSF", `${form.nombre}: se guardó su perfil fiscal (${r.obligaciones} obligación(es)). Ahora sube su CSD y FIEL.`);
      } else {
        await postJson("/api/emisores", form);
        toast("success", "Emisor creado", `${form.nombre} quedó registrado. Ahora sube su CSD y FIEL.`);
      }
      cerrarModal();
      await cargar();
    } catch (e) {
      toast("error", "Revisa los datos", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const descargarCsfSat = async (emisor: Emisor) => {
    setCsfSat(emisor.id);
    setDiagCsf(null);
    try {
      const r = await api<{ ok: boolean; guardado?: boolean; obligaciones?: number; error?: string; pasos: { paso: string; url?: string; status?: number; detalle?: string }[] }>(
        `/api/emisores/${emisor.id}/csf-sat`,
        { method: "POST" },
      );
      if (r.ok) {
        toast("success", "CSF descargada del SAT", `Se guardó su perfil fiscal (${r.obligaciones ?? 0} obligación(es)). Ábrela con «Ver CSF guardada».`);
        await cargar();
      } else {
        toast("error", "No se pudo descargar la CSF (beta)", r.error ?? "Revisa el diagnóstico.");
        setDiagCsf({ error: r.error, pasos: r.pasos ?? [] });
      }
    } catch (e) {
      toast("error", "Error al descargar la CSF", e instanceof ApiError ? e.message : String(e));
    } finally {
      setCsfSat(null);
    }
  };

  const SENTIDO_LABEL: Record<string, string> = {
    positiva: "Positiva",
    negativa: "Negativa",
    sin_obligaciones: "Sin obligaciones",
    desconocido: "Descargada (revisa el PDF)",
  };

  const descargarOpinion = async (emisor: Emisor) => {
    setOpinionSat(emisor.id);
    setDiagCsf(null);
    try {
      const r = await api<{
        ok: boolean;
        opinion?: { sentido: string; folio?: string };
        error?: string;
        pasos: { paso: string; url?: string; status?: number; detalle?: string }[];
      }>(`/api/emisores/${emisor.id}/opinion-sat`, { method: "POST" });
      if (r.ok) {
        const sentido = r.opinion?.sentido ?? "desconocido";
        toast(
          sentido === "negativa" ? "error" : "success",
          `Opinión 32-D: ${SENTIDO_LABEL[sentido] ?? sentido}`,
          sentido === "negativa"
            ? "El SAT reporta incumplimientos. Abre el PDF para ver el detalle."
            : "Se guardó el PDF; ábrelo con «Ver opinión guardada».",
        );
        await cargar();
      } else {
        toast("error", "No se pudo descargar la opinión (beta)", r.error ?? "Revisa el diagnóstico.");
        setDiagCsf({ error: r.error, pasos: r.pasos ?? [] });
      }
    } catch (e) {
      toast("error", "Error al descargar la opinión", e instanceof ApiError ? e.message : String(e));
    } finally {
      setOpinionSat(null);
    }
  };

  const eliminar = async (emisor: Emisor) => {
    if (!confirm(`¿Eliminar al emisor ${emisor.nombre}? Sus certificados dejarán de estar disponibles en el portal.`)) return;
    try {
      await api(`/api/emisores/${emisor.id}`, { method: "DELETE" });
      toast("success", "Emisor eliminado");
      await cargar();
    } catch (e) {
      toast("error", "No se pudo eliminar", e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Empresas / RFCs administrados"
        subtitle="Cada RFC que administra el despacho, con su régimen, CSD para sellar y FIEL para los servicios del SAT. Sus datos están aislados entre sí."
        actions={
          <Button onClick={() => setModalNuevo(true)}>
            <Plus className="size-4" /> Nueva empresa
          </Button>
        }
      />

      {emisores === null ? (
        <Spinner label="Cargando emisores…" />
      ) : emisores.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-7" />}
          title="Da de alta la primera empresa (RFC)"
          detail="Registra el RFC y régimen fiscal de quien factura; después sube su CSD (.cer + .key + contraseña) para poder sellar CFDI."
          action={
            <Button onClick={() => setModalNuevo(true)}>
              <Plus className="size-4" /> Crear empresa
            </Button>
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
          {emisores.map((emisor) => (
            <motion.div key={emisor.id} variants={listItem} whileHover={{ y: -3 }} className="card relative overflow-hidden p-5">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: emisor.colorTag }} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-11 items-center justify-center rounded-xl text-base font-extrabold text-white shadow"
                    style={{ background: emisor.colorTag }}
                  >
                    {emisor.nombre.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-ink-900">{emisor.nombre}</p>
                    <p className="mono text-xs text-ink-600">{emisor.rfc}</p>
                  </div>
                </div>
                <button
                  onClick={() => eliminar(emisor)}
                  className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600"
                  title="Eliminar emisor"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <ChipCertificado cert={emisor.csd} tipo="CSD" />
                <ChipCertificado cert={emisor.fiel} tipo="FIEL" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-ink-400">Régimen</p>
                  <p className="font-bold text-ink-900">{emisor.regimenFiscal}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-ink-400">Expedición</p>
                  <p className="font-bold text-ink-900">CP {emisor.codigoPostal}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-ink-400">Siguiente folio</p>
                  <p className="tnum font-bold text-ink-900">
                    {emisor.serie}-{emisor.folioActual}
                  </p>
                </div>
              </div>

              <Button variant="secondary" className="mt-4 w-full" onClick={() => setCertifica(emisor)}>
                <FileKey2 className="size-4" /> Administrar certificados
              </Button>
              {emisor.fiel && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full text-xs"
                  loading={csfSat === emisor.id}
                  onClick={() => descargarCsfSat(emisor)}
                  title="Autentica en el SAT con la FIEL y baja la Constancia de Situación Fiscal"
                >
                  <CloudDownload className="size-4" /> Descargar CSF del SAT (beta)
                </Button>
              )}
              {emisor.tieneCsf && (
                <a
                  href={`/api/emisores/${emisor.id}/csf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block"
                  title="Abre la Constancia de Situación Fiscal guardada"
                >
                  <Button variant="ghost" className="w-full text-xs">
                    <FileText className="size-4" /> Ver CSF guardada
                  </Button>
                </a>
              )}
              {emisor.fiel && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full text-xs"
                  loading={opinionSat === emisor.id}
                  onClick={() => descargarOpinion(emisor)}
                  title="Autentica en el SAT con la FIEL y baja la Opinión de Cumplimiento (Art. 32-D)"
                >
                  <ShieldCheck className="size-4" /> Opinión de cumplimiento 32-D (beta)
                </Button>
              )}
              {emisor.opinion32d && (
                <a
                  href={`/api/emisores/${emisor.id}/opinion`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block"
                  title="Abre la opinión de cumplimiento guardada"
                >
                  <div
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-bold ${
                      emisor.opinion32d.sentido === "positiva"
                        ? "bg-emerald-50 text-emerald-700"
                        : emisor.opinion32d.sentido === "negativa"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-50 text-ink-600"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {emisor.opinion32d.sentido === "negativa" ? (
                        <ShieldAlert className="size-3.5" />
                      ) : (
                        <ShieldCheck className="size-3.5" />
                      )}
                      Opinión 32-D: {SENTIDO_LABEL[emisor.opinion32d.sentido] ?? emisor.opinion32d.sentido}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium opacity-70">
                      {fechaCorta(emisor.opinion32d.fecha)}
                    </span>
                  </div>
                </a>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Modal nuevo emisor */}
      <Modal
        open={modalNuevo}
        onClose={cerrarModal}
        title="Nueva empresa"
        subtitle="Sube la Constancia de Situación Fiscal para llenar los datos, o captúralos a mano."
      >
        <div className="space-y-4">
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm font-semibold transition ${csfFile ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-brand-200 bg-brand-50/50 text-brand-700 hover:border-brand-400"}`}
          >
            <UploadCloud className="size-4 shrink-0" />
            <span className="truncate">
              {parsingCsf ? "Leyendo Constancia…" : csfFile ? `CSF cargada: ${csfFile.name}` : "Rellenar desde la Constancia (PDF)"}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={parsingCsf}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) rellenarDesdeCsf(f);
              }}
            />
          </label>
          {csfFile && (
            <p className="-mt-2 text-[11px] text-emerald-700">
              También se guardará su régimen y obligaciones. Revisa los datos y ajústalos si hace falta.
            </p>
          )}

          <Field
            label="RFC"
            error={form.rfc && !rfcInfo.valido ? rfcInfo.errores[0] : undefined}
            hint={rfcInfo.advertencias[0]}
          >
            <Input
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
              placeholder="EKU9003173C9"
              maxLength={13}
              className="mono uppercase"
            />
          </Field>
          <Field label="Razón social" hint="Sin régimen de capital: escribe 'MI EMPRESA', no 'MI EMPRESA SA DE CV'.">
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })}
              placeholder="ESCUELA KEMPER URGATE"
            />
          </Field>
          <Field label="Régimen fiscal">
            <Select value={form.regimenFiscal} onChange={(e) => setForm({ ...form, regimenFiscal: e.target.value })}>
              <option value="">Selecciona…</option>
              {regimenesFiltrados.map((r) => (
                <option key={r.clave} value={r.clave}>
                  {r.clave} · {r.descripcion}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal (expedición)">
              <Input
                value={form.codigoPostal}
                onChange={(e) => setForm({ ...form, codigoPostal: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                placeholder="42501"
                inputMode="numeric"
              />
            </Field>
            <Field label="Serie de folios">
              <Input
                value={form.serie}
                onChange={(e) => setForm({ ...form, serie: e.target.value.toUpperCase().slice(0, 10) })}
                placeholder="A"
              />
            </Field>
          </div>
          <Button onClick={crear} loading={guardando} className="w-full">
            {csfFile ? "Crear empresa desde la CSF" : "Guardar emisor"}
          </Button>
        </div>
      </Modal>

      {/* Modal certificados */}
      <Modal
        open={Boolean(certifica)}
        onClose={() => setCertifica(null)}
        title={certifica ? `Certificados de ${certifica.nombre}` : ""}
        subtitle="Los archivos se validan al momento: contraseña, correspondencia .cer/.key, RFC y vigencia. Las contraseñas se guardan cifradas."
        wide
      >
        {certifica && (
          <div className="grid gap-4 md:grid-cols-2">
            <FormularioCertificado emisor={certifica} tipo="csd" onDone={cargar} />
            <FormularioCertificado emisor={certifica} tipo="fiel" onDone={cargar} />
          </div>
        )}
      </Modal>

      {/* Diagnóstico de la descarga de CSF (beta) */}
      <Modal
        open={Boolean(diagCsf)}
        onClose={() => setDiagCsf(null)}
        title="Descarga de CSF (beta) · diagnóstico"
        subtitle="Copia estos pasos y pásamelos para afinar el flujo con el SAT."
        wide
      >
        {diagCsf && (
          <div className="space-y-3">
            {diagCsf.error && <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{diagCsf.error}</p>}
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-ink-500">
                    <th className="p-1.5">Paso</th>
                    <th className="p-1.5">Estado</th>
                    <th className="p-1.5">URL / detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {diagCsf.pasos.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 align-top">
                      <td className="p-1.5 font-semibold">{p.paso}</td>
                      <td className="p-1.5 tnum">{p.status ?? ""}</td>
                      <td className="p-1.5 break-all text-ink-500">
                        <span className="mono">{p.url}</span>
                        {p.detalle ? <span className="block text-ink-400">{p.detalle}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-400">
              Mientras afinamos esto, siempre puedes usar «Rellenar desde la Constancia (PDF)» al crear la empresa, o importar el PDF en Contabilidad → Impuestos.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
