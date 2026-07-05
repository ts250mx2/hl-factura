"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Download,
  Printer,
  SearchCheck,
  Ban,
  RefreshCcw,
  Trash2,
  ChevronDown,
  Copy,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { api, postJson, ApiError, mxn, fechaLarga } from "@/lib/client";
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { MOTIVOS_CANCELACION, descripcionCatalogo, FORMAS_PAGO, METODOS_PAGO, USOS_CFDI } from "@/lib/sat/catalogos";
import type { Factura } from "@/lib/types";

interface Detalle {
  factura: Factura;
  xml: string | null;
  emisor: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string } | null;
  cliente: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string; email?: string } | null;
}

interface EstatusSat {
  codigoEstatus: string;
  estado: string;
  esCancelable: string;
  estatusCancelacion: string;
  validacionEfos: string;
  nota?: string;
}

const ESTADO_BADGE: Record<string, { color: "green" | "red" | "amber" | "slate" | "brand"; label: string }> = {
  timbrada: { color: "green", label: "Timbrada" },
  cancelada: { color: "red", label: "Cancelada" },
  error: { color: "amber", label: "Error de timbrado" },
  sellada: { color: "brand", label: "Sellada sin timbrar" },
  borrador: { color: "slate", label: "Borrador" },
};

function Colapsable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200">
      <button onClick={() => setAbierto(!abierto)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink-900">
        {titulo}
        <ChevronDown className={`size-4 text-ink-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && <div className="border-t border-slate-100 p-4">{children}</div>}
    </div>
  );
}

export default function FacturaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const router = useRouter();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [estatus, setEstatus] = useState<EstatusSat | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [motivo, setMotivo] = useState("02");
  const [folioSust, setFolioSust] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [retimbrando, setRetimbrando] = useState(false);

  const cargar = useCallback(async () => {
    setDetalle(await api<Detalle>(`/api/facturas/${id}`));
  }, [id]);

  useEffect(() => {
    cargar().catch(() => toast("error", "No se encontró la factura"));
  }, [cargar, toast]);

  if (!detalle) return <Spinner label="Cargando factura…" />;
  const { factura: f } = detalle;
  const badge = ESTADO_BADGE[f.estado] ?? ESTADO_BADGE.borrador;

  const copiar = (texto: string, etiqueta: string) => {
    navigator.clipboard.writeText(texto);
    toast("success", `${etiqueta} copiado al portapapeles`);
  };

  const consultarSat = async () => {
    setConsultando(true);
    setEstatus(null);
    try {
      setEstatus(await api<EstatusSat>(`/api/facturas/${id}/estatus`));
    } catch (e) {
      toast("error", "No se pudo consultar al SAT", e instanceof ApiError ? e.message : String(e));
    } finally {
      setConsultando(false);
    }
  };

  const cancelarFactura = async () => {
    setCancelando(true);
    try {
      const res = await postJson<{ estatus: string; demo: boolean }>(`/api/facturas/${id}/cancelar`, {
        motivo,
        folioSustitucion: folioSust,
      });
      toast("success", "Cancelación procesada", res.estatus);
      setModalCancelar(false);
      await cargar();
    } catch (e) {
      toast("error", "No se pudo cancelar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setCancelando(false);
    }
  };

  const reintentar = async () => {
    setRetimbrando(true);
    try {
      await postJson(`/api/facturas/${id}/timbrar`, {});
      toast("success", "¡Factura timbrada!");
      await cargar();
    } catch (e) {
      toast("error", "El timbrado volvió a fallar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setRetimbrando(false);
    }
  };

  const eliminar = async () => {
    if (!confirm("¿Eliminar esta factura no timbrada?")) return;
    try {
      await api(`/api/facturas/${id}`, { method: "DELETE" });
      toast("success", "Factura eliminada");
      router.push("/facturas");
    } catch (e) {
      toast("error", "No se pudo eliminar", e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div>
      <PageHeader
        title={`Factura ${f.serie}-${f.folio}`}
        subtitle={`${f.emisorNombre} → ${f.receptorNombre}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {f.xmlPath && (
              <a href={`/api/facturas/${f.id}/xml`} download>
                <Button variant="secondary">
                  <Download className="size-4" /> XML
                </Button>
              </a>
            )}
            {f.estado === "timbrada" && (
              <>
                <Link href={`/facturas/${f.id}/imprimir`}>
                  <Button variant="secondary">
                    <Printer className="size-4" /> Imprimir / PDF
                  </Button>
                </Link>
                <Button variant="secondary" onClick={consultarSat} loading={consultando}>
                  <SearchCheck className="size-4" /> Estatus SAT
                </Button>
                <Button variant="danger" onClick={() => setModalCancelar(true)}>
                  <Ban className="size-4" /> Cancelar
                </Button>
              </>
            )}
            {f.estado === "error" && (
              <>
                <Button onClick={reintentar} loading={retimbrando}>
                  <RefreshCcw className="size-4" /> Reintentar timbrado
                </Button>
                <Button variant="danger" onClick={eliminar}>
                  <Trash2 className="size-4" /> Eliminar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge color={badge.color}>{badge.label}</Badge>
        {f.demo && <Badge color="amber">TIMBRE DEMO — sin validez fiscal</Badge>}
        {f.cancelacion && (
          <Badge color="red">
            Motivo {f.cancelacion.motivo} · {new Date(f.cancelacion.fecha).toLocaleDateString("es-MX")}
          </Badge>
        )}
      </div>

      {f.estado === "error" && f.errorMsg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-bold">El PAC rechazó el timbrado</p>
            <p className="mt-1 whitespace-pre-line text-xs">{f.errorMsg}</p>
          </div>
        </motion.div>
      )}

      {estatus && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mb-4 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4 text-brand-600" /> Respuesta del SAT (ConsultaCFDIService)
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-ink-400">Estado</p>
              <p className={`font-bold ${estatus.estado === "Vigente" ? "text-emerald-700" : estatus.estado === "Cancelado" ? "text-rose-600" : "text-ink-900"}`}>
                {estatus.estado || "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-ink-400">Es cancelable</p>
              <p className="font-bold">{estatus.esCancelable || "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-ink-400">Estatus cancelación</p>
              <p className="font-bold">{estatus.estatusCancelacion}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-ink-400">EFOS (69-B)</p>
              <p className="font-bold">{estatus.validacionEfos}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-400">{estatus.codigoEstatus}</p>
          {estatus.nota && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">{estatus.nota}</p>}
        </motion.div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5 lg:col-span-2">
          <p className="mb-4 text-sm font-bold">Conceptos</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="pb-2 pr-3 font-semibold">Descripción</th>
                  <th className="pb-2 pr-3 text-right font-semibold">Cant.</th>
                  <th className="pb-2 pr-3 text-right font-semibold">P. unitario</th>
                  <th className="pb-2 text-right font-semibold">Importe</th>
                </tr>
              </thead>
              <tbody>
                {f.conceptos.map((c, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-ink-900">{c.descripcion}</p>
                      <p className="mono text-[11px] text-ink-400">
                        {c.claveProdServ} · {c.claveUnidad}
                      </p>
                    </td>
                    <td className="tnum py-2.5 pr-3 text-right">{c.cantidad}</td>
                    <td className="tnum py-2.5 pr-3 text-right">{mxn.format(c.valorUnitario)}</td>
                    <td className="tnum py-2.5 text-right font-semibold">{mxn.format(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 w-64 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd className="tnum font-semibold">{mxn.format(f.subTotal)}</dd></div>
            {f.descuento > 0 && <div className="flex justify-between"><dt className="text-ink-600">Descuento</dt><dd className="tnum font-semibold text-rose-600">−{mxn.format(f.descuento)}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-600">Traslados</dt><dd className="tnum font-semibold">{mxn.format(f.totalTraslados)}</dd></div>
            {f.totalRetenciones > 0 && <div className="flex justify-between"><dt className="text-ink-600">Retenciones</dt><dd className="tnum font-semibold text-rose-600">−{mxn.format(f.totalRetenciones)}</dd></div>}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base"><dt className="font-extrabold">Total</dt><dd className="tnum font-extrabold text-brand-700">{mxn.format(f.total)}</dd></div>
          </dl>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-4">
          <div className="card p-5 text-sm">
            <p className="mb-3 text-sm font-bold">Datos fiscales</p>
            <dl className="space-y-2 text-xs">
              <div><dt className="text-ink-400">Fecha de emisión</dt><dd className="font-semibold">{f.fecha.replace("T", " ")}</dd></div>
              <div><dt className="text-ink-400">Forma de pago</dt><dd className="font-semibold">{f.formaPago} · {descripcionCatalogo(FORMAS_PAGO, f.formaPago)}</dd></div>
              <div><dt className="text-ink-400">Método de pago</dt><dd className="font-semibold">{f.metodoPago} · {descripcionCatalogo(METODOS_PAGO, f.metodoPago)}</dd></div>
              <div><dt className="text-ink-400">Uso CFDI</dt><dd className="font-semibold">{f.usoCfdi} · {descripcionCatalogo(USOS_CFDI, f.usoCfdi)}</dd></div>
              <div><dt className="text-ink-400">Moneda</dt><dd className="font-semibold">{f.moneda}{f.tipoCambio ? ` · TC ${f.tipoCambio}` : ""}</dd></div>
            </dl>
          </div>

          {f.uuid && (
            <div className="card p-5">
              <p className="mb-2 text-sm font-bold">Timbre Fiscal Digital</p>
              <button onClick={() => copiar(f.uuid!, "UUID")} className="group flex w-full items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-left">
                <span className="mono flex-1 break-all text-[11px] text-ink-900">{f.uuid}</span>
                <Copy className="size-3.5 shrink-0 text-ink-400 group-hover:text-brand-600" />
              </button>
              <dl className="mt-2 space-y-1 text-xs">
                {f.fechaTimbrado && <div className="flex justify-between"><dt className="text-ink-400">Timbrado</dt><dd className="font-medium">{f.fechaTimbrado.replace("T", " ")}</dd></div>}
                {f.rfcProvCertif && <div className="flex justify-between"><dt className="text-ink-400">PAC</dt><dd className="mono font-medium">{f.rfcProvCertif}</dd></div>}
                {f.noCertificadoSAT && <div className="flex justify-between"><dt className="text-ink-400">Cert. SAT</dt><dd className="mono font-medium">{f.noCertificadoSAT}</dd></div>}
              </dl>
            </div>
          )}
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 space-y-3">
        {f.cadenaOriginal && (
          <Colapsable titulo="Cadena original del complemento de certificación">
            <p className="mono max-h-40 overflow-y-auto break-all rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-ink-600">{f.cadenaOriginal}</p>
          </Colapsable>
        )}
        {f.selloCFD && (
          <Colapsable titulo="Sello digital del CFDI">
            <p className="mono max-h-32 overflow-y-auto break-all rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-ink-600">{f.selloCFD}</p>
          </Colapsable>
        )}
        {detalle.xml && (
          <Colapsable titulo="XML del comprobante">
            <pre className="mono max-h-96 overflow-auto rounded-lg bg-[#0e1022] p-4 text-[11px] leading-relaxed text-emerald-200">{detalle.xml}</pre>
          </Colapsable>
        )}
      </motion.div>

      <p className="mt-6 text-xs text-ink-400">Creada el {fechaLarga(f.creadoEl)}</p>

      {/* Modal de cancelación */}
      <Modal
        open={modalCancelar}
        onClose={() => setModalCancelar(false)}
        title="Cancelar ante el SAT"
        subtitle="Desde 2022 el SAT exige indicar el motivo de cancelación."
      >
        <div className="space-y-4">
          <Field label="Motivo">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_CANCELACION.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.clave} · {m.descripcion}
                </option>
              ))}
            </Select>
          </Field>
          {motivo === "01" && (
            <Field label="UUID del CFDI que sustituye" hint="Primero emite la factura correcta y usa aquí su folio fiscal.">
              <Input value={folioSust} onChange={(e) => setFolioSust(e.target.value)} placeholder="ABCD1234-…" className="mono" />
            </Field>
          )}
          <div className="rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">
            Dependiendo del receptor y el monto, la cancelación puede requerir su aceptación
            («EnEsperaAceptacion»). Consulta el estatus después de solicitar.
          </div>
          <Button variant="danger" onClick={cancelarFactura} loading={cancelando} className="w-full">
            <Ban className="size-4" /> Solicitar cancelación
          </Button>
        </div>
      </Modal>
    </div>
  );
}
