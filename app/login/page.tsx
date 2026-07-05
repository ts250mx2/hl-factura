"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, LogIn, Building2, ShieldCheck, FileCheck2, CloudDownload } from "lucide-react";
import { api, postJson, ApiError } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [requiereSetup, setRequiereSetup] = useState<boolean | null>(null);
  const [despacho, setDespacho] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ requiereSetup: boolean }>("/api/auth/estado")
      .then((r) => setRequiereSetup(r.requiereSetup))
      .catch(() => setRequiereSetup(false));
  }, []);

  const enviar = async () => {
    setError("");
    setEnviando(true);
    try {
      if (requiereSetup) {
        await postJson("/api/auth/setup", { despacho, nombre, email, password });
      } else {
        await postJson("/api/auth/login", { email, password });
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error inesperado");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0d1f] p-6">
      {/* Fondo animado */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.5, 0.35] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-brand-600/30 blur-3xl"
      />
      <motion.div
        animate={{ scale: [1.15, 1, 1.15], opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -bottom-48 right-1/4 h-[520px] w-[520px] rounded-full bg-violet-600/25 blur-3xl"
      />

      <div className="relative grid w-full max-w-4xl gap-10 lg:grid-cols-2 lg:items-center">
        {/* Presentación */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden text-white lg:block"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-xl shadow-brand-900/50">
              <Sparkles className="size-6" />
            </div>
            <div>
              <p className="text-xl font-extrabold tracking-tight">HL Factura</p>
              <p className="text-xs text-slate-400">Plataforma multi-despacho · CFDI 4.0</p>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight">
            Administra los RFCs de todos tus clientes
            <span className="bg-gradient-to-r from-brand-300 to-violet-300 bg-clip-text text-transparent"> en un solo lugar</span>
          </h1>
          <ul className="mt-6 space-y-3 text-sm text-slate-300">
            <li className="flex items-center gap-3">
              <Building2 className="size-4 text-brand-300" /> Empresas ilimitadas con sus CSD y FIEL
            </li>
            <li className="flex items-center gap-3">
              <FileCheck2 className="size-4 text-brand-300" /> Emisión y cancelación CFDI 4.0 con timbrado PAC
            </li>
            <li className="flex items-center gap-3">
              <CloudDownload className="size-4 text-brand-300" /> Descarga masiva del SAT con e.firma
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-4 text-brand-300" /> Roles: administrador, supervisor, auxiliar y cliente
            </li>
          </ul>
        </motion.div>

        {/* Formulario */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="card w-full max-w-md justify-self-center p-8"
        >
          {requiereSetup === null ? (
            <p className="py-10 text-center text-sm text-ink-600">Cargando…</p>
          ) : (
            <>
              <h2 className="text-xl font-extrabold text-ink-900">
                {requiereSetup ? "Crea tu despacho" : "Inicia sesión"}
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                {requiereSetup
                  ? "Primer arranque: registra tu despacho o empresa y tu cuenta de administrador."
                  : "Entra con tu cuenta del despacho."}
              </p>

              <div className="mt-6 space-y-4">
                {requiereSetup && (
                  <>
                    <Field label="Nombre del despacho / empresa">
                      <Input value={despacho} onChange={(e) => setDespacho(e.target.value)} placeholder="Despacho Contable Hidalgo" />
                    </Field>
                    <Field label="Tu nombre">
                      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="C.P. Rubén..." />
                    </Field>
                  </>
                )}
                <Field label="Correo">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@despacho.mx"
                    autoComplete="username"
                  />
                </Field>
                <Field label="Contraseña" hint={requiereSetup ? "Mínimo 8 caracteres." : undefined}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={requiereSetup ? "new-password" : "current-password"}
                    onKeyDown={(e) => e.key === "Enter" && enviar()}
                  />
                </Field>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    {error}
                  </motion.p>
                )}
                <Button onClick={enviar} loading={enviando} className="w-full py-3">
                  <LogIn className="size-4" /> {requiereSetup ? "Crear despacho y entrar" : "Entrar"}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
