"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, FilePlus2, Search } from "lucide-react";
import { api, mxn, fechaCorta } from "@/lib/client";
import { Badge, Button, Input, PageHeader, EmptyState, Spinner, listContainer, listItem } from "@/components/ui";
import type { Factura } from "@/lib/types";

const FILTROS = [
  { clave: "", label: "Todas" },
  { clave: "timbrada", label: "Timbradas" },
  { clave: "cancelada", label: "Canceladas" },
  { clave: "error", label: "Con error" },
] as const;

const ESTADO_BADGE: Record<string, { color: "green" | "red" | "amber" | "slate" | "brand"; label: string }> = {
  timbrada: { color: "green", label: "Timbrada" },
  cancelada: { color: "red", label: "Cancelada" },
  error: { color: "amber", label: "Error PAC" },
  sellada: { color: "brand", label: "Sellada" },
  borrador: { color: "slate", label: "Borrador" },
};

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (filtro) params.set("estado", filtro);
    if (busqueda) params.set("q", busqueda);
    const t = setTimeout(() => {
      api<Factura[]>(`/api/facturas?${params}`).then(setFacturas).catch(() => setFacturas([]));
    }, 200);
    return () => clearTimeout(t);
  }, [filtro, busqueda]);

  return (
    <div>
      <PageHeader
        title="Facturas"
        subtitle="Todos tus CFDI emitidos, con su estatus fiscal."
        actions={
          <Link href="/facturas/nueva">
            <Button>
              <FilePlus2 className="size-4" /> Nueva factura
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              onClick={() => setFiltro(f.clave)}
              className={`relative rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                filtro === f.clave ? "text-white" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {filtro === f.clave && (
                <motion.span layoutId="filtro-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 shadow" />
              )}
              <span className="relative">{f.label}</span>
            </button>
          ))}
        </div>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9" placeholder="Cliente, RFC, folio o UUID…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      {facturas === null ? (
        <Spinner label="Cargando facturas…" />
      ) : facturas.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-7" />}
          title={filtro || busqueda ? "Sin resultados" : "Todavía no hay facturas"}
          detail={filtro || busqueda ? "Prueba con otro filtro o búsqueda." : "Cuando emitas tu primer CFDI aparecerá aquí con su folio fiscal y estatus."}
          action={
            !filtro && !busqueda ? (
              <Link href="/facturas/nueva">
                <Button>
                  <FilePlus2 className="size-4" /> Emitir factura
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="card divide-y divide-slate-100 overflow-hidden">
          {facturas.map((f) => {
            const badge = ESTADO_BADGE[f.estado] ?? ESTADO_BADGE.borrador;
            return (
              <motion.div key={f.id} variants={listItem}>
                <Link href={`/facturas/${f.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-brand-50/40">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] font-extrabold text-ink-600">
                    {f.serie}-{f.folio}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{f.receptorNombre}</p>
                    <p className="mono truncate text-xs text-ink-400">
                      {f.receptorRfc}
                      {f.uuid ? ` · ${f.uuid}` : ""}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-xs text-ink-400">{fechaCorta(f.creadoEl)}</p>
                    <p className="text-xs font-medium text-ink-600">{f.emisorRfc}</p>
                  </div>
                  <Badge color={badge.color}>{badge.label}</Badge>
                  {f.origen === "descarga" && <Badge color="sky">Descargado SAT</Badge>}
                  {f.demo && <Badge color="amber">DEMO</Badge>}
                  <span className="tnum w-28 shrink-0 text-right text-sm font-extrabold text-ink-900">{mxn.format(f.total)}</span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
