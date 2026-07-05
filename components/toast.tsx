"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

const ToastContext = createContext<{
  toast: (kind: ToastKind, title: string, detail?: string) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-emerald-500" />,
  error: <AlertTriangle className="size-5 text-rose-500" />,
  info: <Info className="size-5 text-brand-500" />,
};

const BORDERS: Record<ToastKind, string> = {
  success: "border-emerald-200",
  error: "border-rose-200",
  info: "border-brand-200",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (kind: ToastKind, title: string, detail?: string) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, detail }]);
      setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${BORDERS[t.kind]} bg-white/95 p-3.5 shadow-lg backdrop-blur`}
            >
              <div className="mt-0.5 shrink-0">{ICONS[t.kind]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                {t.detail && (
                  <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-ink-600">
                    {t.detail}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-ink-400 transition hover:bg-slate-100 hover:text-ink-600"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
