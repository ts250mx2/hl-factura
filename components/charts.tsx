"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion } from "framer-motion";
import { mxn } from "@/lib/client";

/* Número animado (cuenta hacia arriba al montar) */
export function AnimatedNumber({
  value,
  money,
  className = "",
}: {
  value: number;
  money?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => {
        if (ref.current) {
          ref.current.textContent = money ? mxn.format(v) : Math.round(v).toLocaleString("es-MX");
        }
      },
    });
    return () => controls.stop();
  }, [value, money]);
  return <span ref={ref} className={className} />;
}

/* Escala "bonita" para el eje Y */
function niceMax(max: number): number {
  if (max <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const unit = max / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

function compacto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("es-MX");
}

export interface MesDato {
  mes: string;
  total: number;
  cantidad: number;
}

/*
 * Gráfica de barras de una sola serie (facturación mensual).
 * Marcas delgadas con extremo superior redondeado, rejilla ligera,
 * tooltip al pasar el cursor y etiqueta directa solo en el mes actual.
 */
export function BarChart({ data }: { data: MesDato[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 220;
  const PAD = { top: 18, right: 12, bottom: 28, left: 46 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.total), 1));
  const ticks = [0, max / 2, max];
  const slot = innerW / data.length;
  const barW = Math.min(34, slot * 0.52);

  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Facturación de los últimos 6 meses">
        {/* rejilla */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e8ef" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill="#8f94a8" className="tnum">
              {compacto(t)}
            </text>
          </g>
        ))}
        {/* barras */}
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const barH = Math.max(((d.total / max) * innerH), d.total > 0 ? 3 : 0);
          const esActual = i === data.length - 1;
          const activo = hover === i;
          return (
            <g key={i}>
              {/* zona de interacción más grande que la marca */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              {d.total > 0 && (
                <motion.path
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  d={`M ${cx - barW / 2} ${y(0)}
                      L ${cx - barW / 2} ${y(0) - barH + 4}
                      Q ${cx - barW / 2} ${y(0) - barH} ${cx - barW / 2 + 4} ${y(0) - barH}
                      L ${cx + barW / 2 - 4} ${y(0) - barH}
                      Q ${cx + barW / 2} ${y(0) - barH} ${cx + barW / 2} ${y(0) - barH + 4}
                      L ${cx + barW / 2} ${y(0)} Z`}
                  fill={activo ? "#4f46e5" : "#6366f1"}
                  style={{ pointerEvents: "none" }}
                />
              )}
              {d.total === 0 && (
                <line x1={cx - barW / 2} x2={cx + barW / 2} y1={y(0)} y2={y(0)} stroke="#c9cbdd" strokeWidth={2} style={{ pointerEvents: "none" }} />
              )}
              {/* etiqueta directa solo en el mes actual */}
              {esActual && d.total > 0 && hover === null && (
                <text x={cx} y={y(d.total) - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#3d3f56" className="tnum">
                  {compacto(d.total)}
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={esActual ? "#3d3f56" : "#8f94a8"} fontWeight={esActual ? 700 : 500}>
                {d.mes}
              </text>
            </g>
          );
        })}
        {/* línea base */}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#c9cbdd" strokeWidth={1} />
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%`,
            top: 0,
          }}
        >
          <p className="text-[11px] font-semibold text-ink-600">{data[hover].mes}</p>
          <p className="tnum text-sm font-bold text-ink-900">{mxn.format(data[hover].total)}</p>
          <p className="text-[11px] text-ink-400">
            {data[hover].cantidad} factura{data[hover].cantidad === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
