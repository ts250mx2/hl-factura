"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import { api, mxn } from "@/lib/client";
import { Button, Spinner } from "@/components/ui";
import {
  descripcionCatalogo,
  FORMAS_PAGO,
  METODOS_PAGO,
  USOS_CFDI,
  REGIMENES_FISCALES,
} from "@/lib/sat/catalogos";
import type { Factura } from "@/lib/types";

interface Detalle {
  factura: Factura;
  emisor: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string } | null;
  cliente: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string } | null;
}

function numeroALetras(n: number): string {
  // Conversión simple a letras para el importe (estándar en representaciones impresas)
  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const decenas = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const decenas2 = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  function tresDigitos(x: number): string {
    if (x === 0) return "";
    if (x === 100) return "CIEN";
    const c = Math.floor(x / 100);
    const resto = x % 100;
    let s = c > 0 ? centenas[c] + " " : "";
    if (resto >= 10 && resto < 20) s += decenas[resto - 10];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d >= 2) {
        s += decenas2[d];
        if (u > 0) s += " Y " + unidades[u];
      } else if (u > 0) s += unidades[u];
    }
    return s.trim();
  }

  const entero = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let letras = "";
  if (entero === 0) letras = "CERO";
  else {
    const millones = Math.floor(entero / 1_000_000);
    const miles = Math.floor((entero % 1_000_000) / 1000);
    const resto = entero % 1000;
    if (millones > 0) letras += millones === 1 ? "UN MILLON " : tresDigitos(millones) + " MILLONES ";
    if (miles > 0) letras += miles === 1 ? "MIL " : tresDigitos(miles) + " MIL ";
    letras += tresDigitos(resto);
  }
  return `(${letras.trim() || "CERO"} PESOS ${String(centavos).padStart(2, "0")}/100 M.N.)`;
}

export default function ImprimirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detalle, setDetalle] = useState<Detalle | null>(null);

  useEffect(() => {
    api<Detalle>(`/api/facturas/${id}`).then(setDetalle).catch(() => {});
  }, [id]);

  if (!detalle) return <Spinner label="Preparando representación impresa…" />;
  const { factura: f, emisor, cliente } = detalle;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/facturas/${f.id}`}>
          <Button variant="ghost">
            <ArrowLeft className="size-4" /> Volver
          </Button>
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="print-page card relative overflow-hidden bg-white p-8 text-[13px] leading-relaxed text-slate-800">
        {f.demo && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="rotate-[-24deg] text-5xl font-black tracking-widest text-rose-500/15">
              DEMO · SIN VALIDEZ FISCAL
            </p>
          </div>
        )}

        {/* Encabezado */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
          <div>
            <p className="text-lg font-black tracking-tight">{emisor?.nombre ?? f.emisorNombre}</p>
            <p className="font-mono text-xs">{f.emisorRfc}</p>
            <p className="text-xs">
              Régimen {emisor?.regimenFiscal} · {descripcionCatalogo(REGIMENES_FISCALES, emisor?.regimenFiscal ?? "")}
            </p>
            <p className="text-xs">Lugar de expedición: CP {emisor?.codigoPostal}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-brand-700">CFDI 4.0 · INGRESO</p>
            <p className="text-2xl font-black">
              {f.serie}-{f.folio}
            </p>
            <p className="text-xs">{f.fecha.replace("T", " ")}</p>
          </div>
        </div>

        {/* Receptor */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Receptor</p>
            <p className="font-bold">{cliente?.nombre ?? f.receptorNombre}</p>
            <p className="font-mono text-xs">{f.receptorRfc}</p>
            <p className="text-xs">
              Régimen {cliente?.regimenFiscal} · CP {cliente?.codigoPostal}
            </p>
            <p className="text-xs">
              Uso CFDI: {f.usoCfdi} · {descripcionCatalogo(USOS_CFDI, f.usoCfdi)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pago</p>
            <p className="text-xs">
              Método: {f.metodoPago} · {descripcionCatalogo(METODOS_PAGO, f.metodoPago)}
            </p>
            <p className="text-xs">
              Forma: {f.formaPago} · {descripcionCatalogo(FORMAS_PAGO, f.formaPago)}
            </p>
            <p className="text-xs">
              Moneda: {f.moneda}
              {f.tipoCambio ? ` · TC ${f.tipoCambio}` : ""}
            </p>
            {f.condicionesDePago && <p className="text-xs">Condiciones: {f.condicionesDePago}</p>}
          </div>
        </div>

        {/* Conceptos */}
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-1.5 pr-2">Clave</th>
              <th className="py-1.5 pr-2">Cant.</th>
              <th className="py-1.5 pr-2">Unidad</th>
              <th className="py-1.5 pr-2">Descripción</th>
              <th className="py-1.5 pr-2 text-right">P. Unitario</th>
              <th className="py-1.5 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {f.conceptos.map((c, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="py-1.5 pr-2 font-mono">{c.claveProdServ}</td>
                <td className="py-1.5 pr-2">{c.cantidad}</td>
                <td className="py-1.5 pr-2">{c.claveUnidad}</td>
                <td className="py-1.5 pr-2">{c.descripcion}</td>
                <td className="py-1.5 pr-2 text-right">{mxn.format(c.valorUnitario)}</td>
                <td className="py-1.5 text-right">{mxn.format(c.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="mt-3 flex justify-end">
          <div className="w-56 space-y-0.5 text-xs">
            <div className="flex justify-between"><span>Subtotal</span><span>{mxn.format(f.subTotal)}</span></div>
            {f.descuento > 0 && <div className="flex justify-between"><span>Descuento</span><span>−{mxn.format(f.descuento)}</span></div>}
            <div className="flex justify-between"><span>Impuestos trasladados</span><span>{mxn.format(f.totalTraslados)}</span></div>
            {f.totalRetenciones > 0 && <div className="flex justify-between"><span>Impuestos retenidos</span><span>−{mxn.format(f.totalRetenciones)}</span></div>}
            <div className="flex justify-between border-t-2 border-slate-800 pt-1 text-sm font-black">
              <span>TOTAL</span>
              <span>{mxn.format(f.total)}</span>
            </div>
          </div>
        </div>
        <p className="mt-1 text-right text-[10px] font-medium text-slate-500">{numeroALetras(f.total)}</p>

        {/* Timbre */}
        {f.uuid && (
          <div className="mt-5 flex gap-4 rounded-lg border border-slate-300 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/facturas/${f.id}/qr`} alt="QR de verificación SAT" className="size-32 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5 text-[9px] leading-snug">
              <div>
                <p className="font-bold uppercase text-slate-500">Folio fiscal (UUID)</p>
                <p className="font-mono">{f.uuid}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-3">
                <div>
                  <p className="font-bold uppercase text-slate-500">Fecha de timbrado</p>
                  <p className="font-mono">{f.fechaTimbrado?.replace("T", " ")}</p>
                </div>
                <div>
                  <p className="font-bold uppercase text-slate-500">RFC proveedor de certificación</p>
                  <p className="font-mono">{f.rfcProvCertif}</p>
                </div>
                <div>
                  <p className="font-bold uppercase text-slate-500">No. certificado emisor</p>
                  <p className="font-mono">{f.noCertificado}</p>
                </div>
                <div>
                  <p className="font-bold uppercase text-slate-500">No. certificado SAT</p>
                  <p className="font-mono">{f.noCertificadoSAT}</p>
                </div>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-500">Sello digital del CFDI</p>
                <p className="break-all font-mono">{f.selloCFD?.slice(0, 180)}…</p>
              </div>
              <div>
                <p className="font-bold uppercase text-slate-500">Sello del SAT</p>
                <p className="break-all font-mono">{f.selloSAT?.slice(0, 180)}…</p>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-center text-[9px] text-slate-400">
          Este documento es una representación impresa de un CFDI versión 4.0
          {f.demo ? " emitido en modo demostración (sin validez fiscal)." : "."} Verifícalo en verificacfdi.facturaelectronica.sat.gob.mx
        </p>
      </div>
    </div>
  );
}
