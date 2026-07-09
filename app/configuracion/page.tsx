"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, Zap, Save, ExternalLink, MoonStar, ShieldX, ShieldAlert, RefreshCcw, CloudDownload, Mail, Search, ShieldCheck } from "lucide-react";
import { api, putJson, postJson, ApiError, fechaLarga } from "@/lib/client";
import { Badge, Button, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { ConfigSync, RegistroSync } from "@/lib/types";

interface ConfigView {
  pac: {
    modo: "demo" | "sw";
    swUrlServices: string;
    swUrlApi: string;
    swUser: string;
    tieneToken: boolean;
    tienePassword: boolean;
  };
  sync: ConfigSync;
  smtp: {
    host: string;
    port: number;
    seguro: boolean;
    user: string;
    from: string;
    recordatoriosAuto: boolean;
    tienePassword: boolean;
  };
}

export default function ConfiguracionPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [modo, setModo] = useState<"demo" | "sw">("demo");
  const [swUrlServices, setSwUrlServices] = useState("");
  const [swUser, setSwUser] = useState("");
  const [swPassword, setSwPassword] = useState("");
  const [swToken, setSwToken] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [sync, setSync] = useState<ConfigSync | null>(null);
  const [efos, setEfos] = useState<{ total: number; actualizadoEl: string | null } | null>(null);
  const [lista69, setLista69] = useState<{ total: number; actualizadoEl: string | null } | null>(null);
  const [registros, setRegistros] = useState<RegistroSync[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [actualizandoEfos, setActualizandoEfos] = useState(false);
  const [actualizando69, setActualizando69] = useState(false);
  const [rfcConsulta, setRfcConsulta] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState<{ rfc: string; efos: string | null; lista69: string[] } | null>(null);
  const [smtp, setSmtp] = useState({ host: "", port: 587, seguro: false, user: "", from: "", recordatoriosAuto: false });
  const [smtpPass, setSmtpPass] = useState("");
  const [probandoSmtp, setProbandoSmtp] = useState(false);

  const cargarExtras = useCallback(async () => {
    try {
      const [e, l, s] = await Promise.all([
        api<{ total: number; actualizadoEl: string | null }>("/api/sat/efos"),
        api<{ total: number; actualizadoEl: string | null }>("/api/sat/lista69"),
        api<{ registros: RegistroSync[] }>("/api/sat/sincronizar"),
      ]);
      setEfos(e);
      setLista69(l);
      setRegistros(s.registros);
    } catch {}
  }, []);

  useEffect(() => {
    api<ConfigView>("/api/config")
      .then((c) => {
        setConfig(c);
        setModo(c.pac.modo);
        setSwUrlServices(c.pac.swUrlServices);
        setSwUser(c.pac.swUser);
        setSync(c.sync);
        setSmtp({
          host: c.smtp.host,
          port: c.smtp.port,
          seguro: c.smtp.seguro,
          user: c.smtp.user,
          from: c.smtp.from,
          recordatoriosAuto: c.smtp.recordatoriosAuto,
        });
      })
      .catch(() => {});
    cargarExtras();
  }, [cargarExtras]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await putJson("/api/config", {
        pac: { modo, swUrlServices, swUser, swPassword, swToken },
        sync,
        smtp: { ...smtp, pass: smtpPass },
      });
      toast("success", "Configuración guardada", modo === "demo" ? "Modo demostración activo." : "Timbrado real con SW Sapien activo.");
      setSwPassword("");
      setSwToken("");
      setSmtpPass("");
      setConfig(await api<ConfigView>("/api/config"));
    } catch (e) {
      toast("error", "No se pudo guardar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const sincronizarAhora = async () => {
    setSincronizando(true);
    try {
      const r = await postJson<{ solicitudes: number; errores: string[] }>("/api/sat/sincronizar", {});
      if (r.solicitudes > 0) {
        toast("success", `${r.solicitudes} solicitudes presentadas al SAT`, "Los paquetes se descargan e ingieren automáticamente conforme el SAT los prepara (revisa la Bóveda en unos minutos).");
      }
      for (const err of r.errores) toast("error", "Sincronización", err);
      await cargarExtras();
    } catch (e) {
      toast("error", "No se pudo sincronizar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  };

  const actualizarEfos = async () => {
    setActualizandoEfos(true);
    try {
      const r = await postJson<{ total: number; afectados: number }>("/api/sat/efos", {});
      toast("success", `Lista 69-B actualizada: ${r.total.toLocaleString("es-MX")} RFCs`,
        r.afectados > 0 ? `¡Atención! ${r.afectados} CFDI de tu bóveda quedaron bloqueados por EFOS.` : "Ningún CFDI de tu bóveda coincide con la lista.");
      await cargarExtras();
    } catch (e) {
      toast("error", "No se pudo actualizar EFOS", e instanceof ApiError ? e.message : String(e));
    } finally {
      setActualizandoEfos(false);
    }
  };

  const actualizar69 = async () => {
    setActualizando69(true);
    try {
      const r = await postJson<{ total: number; categorias: number; fallidas: string[]; afectados: number }>("/api/sat/lista69", {});
      toast(
        "success",
        `Lista del Artículo 69 actualizada: ${r.total.toLocaleString("es-MX")} RFCs`,
        r.afectados > 0
          ? `¡Atención! ${r.afectados} proveedor(es) de tu bóveda aparecen en la lista. Revisa las alertas.`
          : `Ningún proveedor de tu bóveda aparece en la lista.${r.fallidas.length ? ` (${r.fallidas.length} categoría(s) no se pudieron bajar)` : ""}`,
      );
      await cargarExtras();
    } catch (e) {
      toast("error", "No se pudo actualizar la lista 69", e instanceof ApiError ? e.message : String(e));
    } finally {
      setActualizando69(false);
    }
  };

  const consultarRfc = async () => {
    const rfc = rfcConsulta.trim().toUpperCase();
    if (!rfc) return;
    setConsultando(true);
    setResultado(null);
    try {
      setResultado(await api<{ rfc: string; efos: string | null; lista69: string[] }>(`/api/sat/consulta-rfc?rfc=${encodeURIComponent(rfc)}`));
    } catch (e) {
      toast("error", "No se pudo consultar", e instanceof ApiError ? e.message : String(e));
    } finally {
      setConsultando(false);
    }
  };

  if (!config) return <Spinner label="Cargando configuración…" />;

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="El timbrado fiscal solo puede hacerlo un PAC autorizado por el SAT. Elige cómo timbrar."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setModo("demo")}
          className={`card p-5 text-left transition ${modo === "demo" ? "border-brand-500 ring-4 ring-brand-500/10" : "hover:border-brand-200"}`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <FlaskConical className="size-6" />
            </div>
            <div>
              <p className="font-bold">Modo demostración</p>
              <p className="text-xs text-ink-600">Sin registro, funciona de inmediato</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-600">
            Todo el flujo funciona (XML, cadena original, sellado con tu CSD real) pero el timbre es{" "}
            <b>simulado y no tiene validez fiscal</b>. Perfecto para conocer el portal y probar.
          </p>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => setModo("sw")}
          className={`card p-5 text-left transition ${modo === "sw" ? "border-brand-500 ring-4 ring-brand-500/10" : "hover:border-brand-200"}`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Zap className="size-6" />
            </div>
            <div>
              <p className="font-bold">PAC: SW Sapien (smarterweb)</p>
              <p className="text-xs text-ink-600">Timbres reales con validez fiscal</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-600">
            Conecta tu cuenta de SW. Su <b>sandbox es gratuito</b> (services.test.sw.com.mx) y para
            producción usa services.sw.com.mx con tus credenciales contratadas.
          </p>
        </motion.button>
      </div>

      {modo === "sw" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 space-y-4 p-5">
          <p className="text-sm font-bold">Credenciales de SW Sapien</p>
          <Field label="URL de servicios" hint="Pruebas: https://services.test.sw.com.mx · Producción: https://services.sw.com.mx">
            <Input value={swUrlServices} onChange={(e) => setSwUrlServices(e.target.value)} className="mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usuario (correo)">
              <Input value={swUser} onChange={(e) => setSwUser(e.target.value)} placeholder="tu@correo.com" />
            </Field>
            <Field label="Contraseña" hint={config.pac.tienePassword ? "Ya hay una guardada; escribe solo para cambiarla." : undefined}>
              <Input type="password" value={swPassword} onChange={(e) => setSwPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>
          <Field label="Token (alternativa a usuario/contraseña)" hint={config.pac.tieneToken ? "Ya hay un token guardado; escribe solo para reemplazarlo." : "Si tienes un token infinito de SW, pégalo aquí."}>
            <Input type="password" value={swToken} onChange={(e) => setSwToken(e.target.value)} className="mono" placeholder="T2lYQ0t4dEZDbF..." />
          </Field>
          <a
            href="https://developers.sw.com.mx"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Documentación y registro gratuito en developers.sw.com.mx <ExternalLink className="size-3" />
          </a>
        </motion.div>
      )}

      {/* Sincronización nocturna con el SAT */}
      {sync && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <MoonStar className="size-6" />
              </div>
              <div>
                <p className="font-bold">Sincronización nocturna con el SAT</p>
                <p className="text-xs text-ink-600">
                  Descarga diaria de emitidas, recibidas y metadata de todas las empresas con FIEL; conciliación y validación automática.
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={sync.activada}
                onChange={(e) => setSync({ ...sync, activada: e.target.checked })}
                className="size-5 accent-brand-600"
              />
              <span className="text-sm font-bold">{sync.activada ? "Activada" : "Desactivada"}</span>
            </label>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Hora de la corrida" hint="Hora local del servidor.">
              <Input type="time" value={sync.hora} onChange={(e) => setSync({ ...sync, hora: e.target.value })} />
            </Field>
            <Field label="Ventana (días hacia atrás)" hint="Se traslapa para no perder nada.">
              <Input
                type="number"
                min={1}
                max={30}
                value={sync.ventanaDias}
                onChange={(e) => setSync({ ...sync, ventanaDias: Number(e.target.value) || 3 })}
                className="tnum"
              />
            </Field>
            <div className="flex flex-col justify-end gap-1.5 pb-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sync.emitidas} onChange={(e) => setSync({ ...sync, emitidas: e.target.checked })} className="size-4 accent-brand-600" />
                CFDI emitidos
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sync.recibidas} onChange={(e) => setSync({ ...sync, recibidas: e.target.checked })} className="size-4 accent-brand-600" />
                CFDI recibidos
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sync.metadata} onChange={(e) => setSync({ ...sync, metadata: e.target.checked })} className="size-4 accent-brand-600" />
                Metadata (conciliador de cancelados)
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={sincronizarAhora} loading={sincronizando}>
              <CloudDownload className="size-4" /> Sincronizar ahora
            </Button>
            {sync.ultimaEjecucion && (
              <span className="text-xs text-ink-400">Última corrida: {fechaLarga(sync.ultimaEjecucion)}</span>
            )}
          </div>

          {registros.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {registros.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <Badge color={r.resultado === "ok" ? "green" : r.resultado === "error" ? "red" : r.resultado === "parcial" ? "amber" : "sky"}>
                    {r.resultado}
                  </Badge>
                  <span className="text-ink-600">{r.detalle}</span>
                  <span className="ml-auto shrink-0 text-ink-400">{new Date(r.inicio).toLocaleString("es-MX")}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Lista EFOS 69-B */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <ShieldX className="size-6" />
            </div>
            <div>
              <p className="font-bold">Lista negra del SAT (Artículo 69-B / EFOS)</p>
              <p className="text-xs text-ink-600">
                {efos && efos.total > 0
                  ? `${efos.total.toLocaleString("es-MX")} RFCs en la lista · actualizada ${efos.actualizadoEl ? fechaLarga(efos.actualizadoEl) : ""}`
                  : "Aún no se ha descargado la lista. Descárgala para blindar tus deducciones."}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={actualizarEfos} loading={actualizandoEfos}>
            <RefreshCcw className="size-4" /> {efos && efos.total > 0 ? "Actualizar lista" : "Descargar lista"}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Cada CFDI recibido se cruza contra esta lista: si el proveedor aparece como «Presunto» o «Definitivo»,
          el comprobante se bloquea para deducción y se genera una alerta crítica. La lista también se refresca
          automáticamente en cada corrida nocturna.
        </p>
      </motion.div>

      {/* Lista Artículo 69 (incumplidos / no localizados) */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <p className="font-bold">Lista negra del SAT (Artículo 69 · incumplidos)</p>
              <p className="text-xs text-ink-600">
                {lista69 && lista69.total > 0
                  ? `${lista69.total.toLocaleString("es-MX")} RFCs en la lista · actualizada ${lista69.actualizadoEl ? fechaLarga(lista69.actualizadoEl) : ""}`
                  : "Aún no se ha descargado. Incluye no localizados, créditos firmes/cancelados, condonados y sentencias."}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={actualizar69} loading={actualizando69}>
            <RefreshCcw className="size-4" /> {lista69 && lista69.total > 0 ? "Actualizar lista" : "Descargar lista"}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          A diferencia del 69-B, el Artículo 69 <b>no bloquea</b> la deducción, pero si un proveedor tuyo aparece
          (por ejemplo «no localizado» o con «créditos firmes») se genera un aviso: conviene revisar la materialidad
          de esas operaciones.
        </p>
      </motion.div>

      {/* Consulta de un RFC contra las listas negras */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
            <Search className="size-6" />
          </div>
          <div>
            <p className="font-bold">Consulta de RFC en listas negras</p>
            <p className="text-xs text-ink-600">Verifica a un cliente o proveedor antes de operar con él (usa las listas ya descargadas).</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="RFC a consultar" className="min-w-56 flex-1">
            <Input
              value={rfcConsulta}
              onChange={(e) => setRfcConsulta(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && consultarRfc()}
              placeholder="XAXX010101000"
              maxLength={13}
              className="mono uppercase"
            />
          </Field>
          <Button onClick={consultarRfc} loading={consultando} disabled={!rfcConsulta.trim()}>
            <Search className="size-4" /> Consultar
          </Button>
        </div>
        {resultado && (
          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <p className="mono text-sm font-bold text-ink-900">{resultado.rfc}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!resultado.efos && resultado.lista69.length === 0 ? (
                <Badge color="green"><ShieldCheck className="size-3" /> Sin coincidencias en las listas descargadas</Badge>
              ) : (
                <>
                  {resultado.efos && (
                    <Badge color={resultado.efos === "Presunto" || resultado.efos === "Definitivo" ? "red" : "slate"}>
                      69-B / EFOS: {resultado.efos}
                    </Badge>
                  )}
                  {resultado.lista69.map((s) => (
                    <Badge key={s} color="amber">Art. 69: {s}</Badge>
                  ))}
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              Resultado contra las listas ya descargadas. Actualízalas arriba para tener la versión más reciente del SAT.
            </p>
          </div>
        )}
      </motion.div>

      {/* Correo (recordatorios de cobranza) */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Mail className="size-6" />
            </div>
            <div>
              <p className="font-bold">Correo saliente (recordatorios de cobranza)</p>
              <p className="text-xs text-ink-600">SMTP para enviar recordatorios de facturas por vencer o vencidas.</p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={smtp.recordatoriosAuto}
              onChange={(e) => setSmtp({ ...smtp, recordatoriosAuto: e.target.checked })}
              className="size-5 accent-brand-600"
            />
            <span className="text-sm font-bold">Recordatorios automáticos nocturnos</span>
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Servidor SMTP">
            <Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" className="mono" />
          </Field>
          <Field label="Puerto">
            <Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) || 587 })} className="tnum" />
          </Field>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smtp.seguro} onChange={(e) => setSmtp({ ...smtp, seguro: e.target.checked })} className="size-4 accent-brand-600" />
              SSL/TLS directo (puerto 465)
            </label>
          </div>
          <Field label="Usuario">
            <Input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} placeholder="cobranza@midespacho.mx" />
          </Field>
          <Field label="Contraseña" hint={config.smtp.tienePassword ? "Ya hay una guardada; escribe solo para cambiarla." : undefined}>
            <Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" />
          </Field>
          <Field label="Remitente (From)">
            <Input value={smtp.from} onChange={(e) => setSmtp({ ...smtp, from: e.target.value })} placeholder='"Mi Despacho" <cobranza@midespacho.mx>' />
          </Field>
        </div>
        <Button
          variant="secondary"
          className="mt-3"
          loading={probandoSmtp}
          onClick={async () => {
            setProbandoSmtp(true);
            try {
              await postJson("/api/smtp/probar", {});
              toast("success", "Conexión SMTP exitosa");
            } catch (e) {
              toast("error", "SMTP", e instanceof ApiError ? e.message : String(e));
            } finally {
              setProbandoSmtp(false);
            }
          }}
        >
          Probar conexión (guarda primero)
        </Button>
      </motion.div>

      <div className="mt-6">
        <Button onClick={guardar} loading={guardando}>
          <Save className="size-4" /> Guardar configuración
        </Button>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="card mt-8 p-5 text-xs leading-relaxed text-ink-600">
        <p className="mb-2 text-sm font-bold text-ink-900">¿Qué hace este portal con el SAT?</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Sellado CSD:</b> genera la cadena original 4.0 y firma SHA-256/RSA con tu certificado — 100% local.</li>
          <li><b>Timbrado:</b> vía PAC (obligatorio por ley; el SAT no timbra directamente).</li>
          <li><b>Consulta de estatus:</b> servicio público ConsultaCFDIService del SAT, sin certificados.</li>
          <li><b>Cancelación:</b> con motivos 01-04 vía PAC, firmada con tu CSD.</li>
          <li><b>Descarga masiva:</b> web service oficial del SAT autenticado con tu FIEL.</li>
          <li><b>Seguridad:</b> llaves y contraseñas se quedan en tu equipo; las contraseñas se cifran con AES-256-GCM.</li>
        </ul>
      </motion.div>
    </div>
  );
}
