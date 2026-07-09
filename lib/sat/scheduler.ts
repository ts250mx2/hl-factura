import { despachosConSync } from "../repos";
import { ejecutarSincronizacion, procesarPendientes } from "./sincronizador";
import { actualizarListaEfos } from "./efos";
import { actualizarLista69 } from "./lista69";

// Scheduler integrado: corre dentro del proceso del servidor Next.js.
//  - Cada minuto revisa si algún despacho tiene programada su corrida nocturna.
//  - Cada 10 minutos avanza las solicitudes pendientes ante el SAT.
//  - La corrida nocturna además refresca las listas negras 69-B (EFOS) y 69.

declare global {
  // eslint-disable-next-line no-var
  var __hlScheduler: boolean | undefined;
}

function horaActual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function esMismoDia(iso: string | undefined, ahora: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === ahora.getFullYear() &&
    d.getMonth() === ahora.getMonth() &&
    d.getDate() === ahora.getDate()
  );
}

async function tickNocturno() {
  try {
    const despachos = await despachosConSync();
    const ahora = new Date();
    const hora = horaActual();
    let efosActualizado = false;

    for (const { despachoId, cfg } of despachos) {
      if (cfg.hora !== hora) continue;
      if (esMismoDia(cfg.ultimaEjecucion, ahora)) continue;

      console.log(`[sync] Corrida nocturna del despacho ${despachoId} (${hora})`);
      if (!efosActualizado) {
        try {
          const r = await actualizarListaEfos();
          console.log(`[sync] Lista EFOS actualizada: ${r.total} RFCs, ${r.afectados} CFDI afectados`);
        } catch (e) {
          console.error("[sync] No se pudo actualizar EFOS:", e instanceof Error ? e.message : e);
        }
        try {
          const r = await actualizarLista69();
          console.log(`[sync] Lista 69 actualizada: ${r.total} RFCs, ${r.afectados} proveedor(es) con aviso`);
        } catch (e) {
          console.error("[sync] No se pudo actualizar la lista 69:", e instanceof Error ? e.message : e);
        }
        efosActualizado = true;
      }
      try {
        const r = await ejecutarSincronizacion(despachoId);
        console.log(`[sync] ${r.solicitudes} solicitudes presentadas`);
      } catch (e) {
        console.error("[sync] Error en sincronización:", e instanceof Error ? e.message : e);
      }
      try {
        const { enviarRecordatoriosAutomaticos } = await import("../cxc");
        const enviados = await enviarRecordatoriosAutomaticos(despachoId);
        if (enviados > 0) console.log(`[sync] ${enviados} recordatorio(s) de cobranza enviados`);
      } catch (e) {
        console.error("[sync] recordatorios:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    // Sin conexión a BD u otro error transitorio: se reintenta en el siguiente tick
    console.error("[sync] tick:", e instanceof Error ? e.message : e);
  }
}

async function tickPendientes() {
  try {
    const r = await procesarPendientes();
    if (r.procesadas > 0 || r.ingeridas > 0) {
      console.log(`[sync] Pendientes: ${r.procesadas} verificadas, ${r.ingeridas} ingeridas a la bóveda`);
    }
  } catch (e) {
    console.error("[sync] pendientes:", e instanceof Error ? e.message : e);
  }
}

export function iniciarScheduler() {
  if (globalThis.__hlScheduler) return;
  globalThis.__hlScheduler = true;
  console.log("[sync] Scheduler de sincronización SAT iniciado");
  setInterval(tickNocturno, 60_000);
  setInterval(tickPendientes, 10 * 60_000);
  // Primer avance de pendientes poco después de arrancar
  setTimeout(tickPendientes, 20_000);
}
