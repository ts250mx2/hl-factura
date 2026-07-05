import {
  listarEmpresas,
  guardarDescarga,
  getEmpresa,
  getConfigSync,
  guardarConfigSync,
  registrarSync,
  solicitudesPendientesSync,
  crearAlerta,
  genId,
} from "../repos";
import { solicitarDescarga, verificarDescarga, descargarPaquete } from "./descarga";
import { ingerirSolicitud } from "./ingesta";
import type { SolicitudDescarga } from "../types";

// Sincronización con el SAT: presenta solicitudes de descarga por cada empresa
// con FIEL, y un procesador avanza las pendientes (verificar → descargar →
// ingerir a la bóveda) hasta completarlas.

function fechaLocal(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Presenta las solicitudes del día para todas las empresas con FIEL del despacho. */
export async function ejecutarSincronizacion(
  despachoId: string,
  opts?: { manual?: boolean },
): Promise<{ solicitudes: number; errores: string[] }> {
  const cfg = await getConfigSync(despachoId);
  const registro = {
    id: genId(),
    despachoId,
    inicio: new Date().toISOString(),
    resultado: "en_curso" as const,
    detalle: opts?.manual ? "Sincronización manual" : "Sincronización programada",
  };
  await registrarSync(registro);

  const hoy = new Date();
  const desde = new Date(hoy.getTime() - Math.max(1, cfg.ventanaDias) * 86_400_000);
  const fechaInicio = fechaLocal(desde);
  const fechaFin = fechaLocal(hoy);

  const empresas = (await listarEmpresas(despachoId)).filter((e) => e.fiel);
  const errores: string[] = [];
  let solicitudes = 0;

  for (const empresa of empresas) {
    const tipos: ("emitidas" | "recibidas")[] = [];
    if (cfg.emitidas) tipos.push("emitidas");
    if (cfg.recibidas) tipos.push("recibidas");

    for (const tipo of tipos) {
      const formatos: ("xml" | "metadata")[] = ["xml"];
      if (cfg.metadata) formatos.push("metadata");
      for (const formato of formatos) {
        try {
          const { requestId } = await solicitarDescarga(empresa, { tipo, formato, fechaInicio, fechaFin });
          const solicitud: SolicitudDescarga = {
            id: genId(),
            emisorId: empresa.id,
            emisorRfc: empresa.rfc,
            tipo,
            formato,
            fechaInicio,
            fechaFin,
            requestId,
            estado: "solicitada",
            mensaje: "Solicitud presentada por la sincronización automática.",
            paquetes: [],
            origen: "sync",
            creadoEl: new Date().toISOString(),
            actualizadoEl: new Date().toISOString(),
          };
          await guardarDescarga(solicitud);
          solicitudes++;
        } catch (e) {
          errores.push(`${empresa.rfc} ${tipo}/${formato}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  const fin = new Date().toISOString();
  await registrarSync({
    ...registro,
    fin,
    resultado: errores.length === 0 ? "ok" : solicitudes > 0 ? "parcial" : "error",
    detalle: `${solicitudes} solicitud(es) presentadas para ${empresas.length} empresa(s), periodo ${fechaInicio} → ${fechaFin}.${errores.length ? ` Errores: ${errores.join(" | ")}` : ""}`,
  });

  cfg.ultimaEjecucion = fin;
  await guardarConfigSync(despachoId, cfg);

  if (empresas.length === 0) {
    errores.push("Ninguna empresa tiene FIEL cargada; no hay nada que sincronizar.");
  }
  return { solicitudes, errores };
}

/**
 * Avanza las solicitudes pendientes (de sync o manuales): verifica en el SAT,
 * descarga los paquetes listos y los ingesta a la bóveda.
 */
export async function procesarPendientes(): Promise<{ procesadas: number; ingeridas: number }> {
  const pendientes = await solicitudesPendientesSync();
  let procesadas = 0;
  let ingeridas = 0;

  for (const solicitud of pendientes) {
    try {
      const empresa = await getEmpresa(solicitud.emisorId);
      if (!empresa || !empresa.fiel) continue;

      // Solicitudes de más de 5 días sin resolverse: se dan por expiradas
      if (Date.now() - new Date(solicitud.creadoEl).getTime() > 5 * 86_400_000) {
        solicitud.estado = "rechazada";
        solicitud.mensaje = "La solicitud expiró sin completarse.";
        solicitud.actualizadoEl = new Date().toISOString();
        await guardarDescarga(solicitud);
        continue;
      }

      if ((solicitud.estado === "solicitada" || solicitud.estado === "en_proceso") && solicitud.requestId) {
        const estado = await verificarDescarga(empresa, solicitud.requestId);
        solicitud.mensaje = estado.mensaje;
        solicitud.actualizadoEl = new Date().toISOString();
        if (estado.fallida) solicitud.estado = "rechazada";
        else if (estado.terminada) {
          solicitud.estado = "lista";
          solicitud.paquetes = estado.paquetes.map((pid) => ({ id: pid, descargado: false }));
        } else solicitud.estado = "en_proceso";
        await guardarDescarga(solicitud);
        procesadas++;
      }

      if (solicitud.estado === "lista") {
        for (const paquete of solicitud.paquetes) {
          if (!paquete.descargado) {
            paquete.zipPath = await descargarPaquete(empresa, paquete.id);
            paquete.descargado = true;
          }
        }
        solicitud.estado = "descargada";
        solicitud.actualizadoEl = new Date().toISOString();
        await guardarDescarga(solicitud);

        const resultado = await ingerirSolicitud(empresa, solicitud);
        ingeridas++;
        if (resultado.xmls > 0 || resultado.cancelados > 0) {
          await crearAlerta({
            despachoId: empresa.despachoId,
            empresaId: empresa.id,
            tipo: "sync",
            severidad: resultado.cancelados > 0 ? "aviso" : "info",
            titulo: `Descarga SAT completada: ${empresa.rfc} (${solicitud.tipo}/${solicitud.formato})`,
            detalle: `${resultado.xmls} XML nuevos en la bóveda, ${resultado.metadata} registros de metadata conciliados, ${resultado.cancelados} cancelación(es) detectadas.`,
          });
        }
      }
    } catch (e) {
      solicitud.mensaje = `Error al procesar: ${e instanceof Error ? e.message : e}`;
      solicitud.actualizadoEl = new Date().toISOString();
      await guardarDescarga(solicitud);
    }
  }
  return { procesadas, ingeridas };
}
