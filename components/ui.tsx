"use client";

import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, forwardRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";

/* ---------- Botones ---------- */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

const BTN: Record<BtnVariant, string> = {
  primary:
    "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-md shadow-brand-600/25 hover:shadow-lg hover:shadow-brand-600/30 hover:brightness-110",
  secondary:
    "bg-white text-ink-900 border border-slate-200 shadow-sm hover:border-brand-300 hover:text-brand-700 hover:shadow",
  ghost: "text-ink-600 hover:bg-slate-100 hover:text-ink-900",
  danger: "bg-rose-600 text-white shadow-md shadow-rose-600/25 hover:bg-rose-500",
  success: "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500",
};

export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${BTN[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Campos ---------- */

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-600">
        {label}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  );
}

const INPUT_BASE =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${INPUT_BASE} ${className}`} {...props} />;
  },
);

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${INPUT_BASE} appearance-none pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

/* ---------- Badges ---------- */

export function Badge({
  color = "slate",
  children,
}: {
  color?: "slate" | "green" | "red" | "amber" | "brand" | "sky";
  children: ReactNode;
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-800",
    brand: "bg-brand-100 text-brand-800",
    sky: "bg-sky-100 text-sky-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colors[color]}`}
    >
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 backdrop-blur-sm sm:p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className={`card relative my-auto w-full ${wide ? "max-w-3xl" : "max-w-lg"} p-6`}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink-900">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-ink-600">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-ink-400 transition hover:bg-slate-100 hover:text-ink-900"
              >
                <X className="size-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Encabezado de página ---------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-6 flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/* ---------- Estado vacío ---------- */

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-violet-100 text-brand-600">
        {icon}
      </div>
      <p className="text-base font-bold text-ink-900">{title}</p>
      {detail && <p className="max-w-md text-sm text-ink-600">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}

/* ---------- Animación de lista ---------- */

export const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export const listItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 26 } },
};

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-600">
      <Loader2 className="size-6 animate-spin text-brand-500" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
}
