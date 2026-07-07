import {
  upsertCfdiDescargado,
  getCfdiDescargado,
  crearAlerta,
  existeAlerta,
  buscarEfos,
  guardarDescarga,
} from "../repos";
import { guardarArchivo, idCfdi } from "../archivos";
import { situacionBloquea } from "./efos";
import { leerPaquete } from "./descarga";
import { parseCfdiBasico, type DatosCfdi } from "./cfdi-parse";
import { derivarDeCfdi } from "./derivar";
import type { CfdiDescargado, Emisor, SolicitudDescarga } from "../types";

// Ingesta de CFDI a la bóveda: cada XML descargado del SAT (o importado a mano)
// se analiza, se guarda en la base de datos, se registra y pasa por el motor de
// validación fiscal (EFOS 69-B y requisitos de deducción). Además se derivan
// clientes/proveedores, productos, facturas y pagos a las páginas de operación.

export { parseCfdiBasico };

/** Reglas de deducibilidad para CFDI recibidos. */
function evaluarDeducibilidad(datos: DatosCfdi, situacionEfos?: string) {
  if (situacionBloquea(situacionEfos)) {
    return {
      efos: situacionEfos!.toLowerCase() as "presunto" | "definitivo",
      deducible: "bloqueado_efos" as const,
      motivo: `El emisor ${datos.emisorRfc} aparece como "${situacionEfos}" en la lista 69-B del SAT`,
    };
  }
  // Art. 27 fracc. III LISR: pagos > $2,000 deben ser con medios distintos a efectivo
  if (datos.total > 2000 && datos.formaPago === "01") {
    return {
      efos: null,
      deducible: "no_deducible" as const,
      motivo: `Pago en efectivo por $${datos.total.toFixed(2)} (supera el límite de $2,000 para deducción, Art. 27 LISR)`,
    };
  }
  return { efos: null, deducible: "ok" as const, motivo: undefined };
}

export interface ResultadoIngesta {
  uuid: string;
  nuevo: boolean;
  deducible: string;
  efos: boolean;
}

/** Ingesta un XML a la bóveda de la empresa, con validación fiscal y alertas. */
export async function ingerirXml(
  empresa: Emisor,
  tipo: "emitida" | "recibida",
  xml: string,
): Promise<ResultadoIngesta> {
  const datos = parseCfdiBasico(xml);

  await guardarArchivo(idCfdi(empresa.id, datos.uuid), "cfdi", "application/xml", `${datos.uuid}.xml`, Buffer.from(xml, "utf8"), empresa.id);
  const xmlPath = idCfdi(empresa.id, datos.uuid);

  const existente = await getCfdiDescargado(datos.uuid, empresa.id);

  let evaluacion: ReturnType<typeof evaluarDeducibilidad> = { efos: null, deducible: "ok", motivo: undefined };
  if (tipo === "recibida") {
    const situaciones = await buscarEfos([datos.emisorRfc]);
    evaluacion = evaluarDeducibilidad(datos, situaciones.get(datos.emisorRfc));
  }

  const registro: CfdiDescargado = {
    uuid: datos.uuid,
    empresaId: empresa.id,
    tipo,
    tipoComprobante: datos.tipoComprobante,
    emisorRfc: datos.emisorRfc,
    emisorNombre: datos.emisorNombre,
    receptorRfc: datos.receptorRfc,
    receptorNombre: datos.receptorNombre,
    fecha: datos.fecha,
    total: datos.total,
    metodoPago: datos.metodoPago,
    formaPago: datos.formaPago,
    estatusSat: existente?.estatusSat ?? "vigente",
    xmlPath,
    efos: evaluacion.efos,
    deducible: evaluacion.deducible,
    motivoNoDeducible: evaluacion.motivo,
    actualizadoEl: new Date().toISOString(),
  };
  await upsertCfdiDescargado(registro);

  // Derivar a las páginas de operación (clientes/proveedores, productos,
  // facturas, pagos). No debe interrumpir la ingesta si algo falla.
  try {
    await derivarDeCfdi(empresa, tipo, xml);
  } catch {
    /* la derivación es best-effort; el CFDI ya quedó en la bóveda */
  }

  // Alertas (solo la primera vez por UUID)
  if (tipo === "recibida" && evaluacion.deducible === "bloqueado_efos") {
    if (!(await existeAlerta(empresa.despachoId, "efos", datos.uuid))) {
      await crearAlerta({
        despachoId: empresa.despachoId,
        empresaId: empresa.id,
        tipo: "efos",
        severidad: "critica",
        titulo: `Proveedor en lista 69-B: ${datos.emisorNombre || datos.emisorRfc}`,
        detalle: `El CFDI ${datos.uuid} por $${datos.total.toFixed(2)} quedó BLOQUEADO para deducción. ${evaluacion.motivo}.`,
        uuid: datos.uuid,
      });
    }
  } else if (tipo === "recibida" && evaluacion.deducible === "no_deducible") {
    if (!(await existeAlerta(empresa.despachoId, "deduccion", datos.uuid))) {
      await crearAlerta({
        despachoId: empresa.despachoId,
        empresaId: empresa.id,
        tipo: "deduccion",
        severidad: "aviso",
        titulo: `CFDI marcado NO deducible: ${datos.emisorNombre || datos.emisorRfc}`,
        detalle: `${evaluacion.motivo}. UUID: ${datos.uuid}.`,
        uuid: datos.uuid,
      });
    }
  }

  return {
    uuid: datos.uuid,
    nuevo: !existente,
    deducible: evaluacion.deducible,
    efos: Boolean(evaluacion.efos),
  };
}

/**
 * Conciliador de metadata: cruza el estatus reportado por el SAT contra la
 * bóveda para detectar CFDI cancelados (p. ej. por un proveedor).
 */
export async function conciliarMetadata(
  empresa: Emisor,
  tipo: "emitida" | "recibida",
  filas: Record<string, string>[],
): Promise<{ nuevos: number; cancelados: number }> {
  let nuevos = 0;
  let cancelados = 0;
  for (const fila of filas) {
    const uuid = (fila.uuid ?? "").toUpperCase();
    if (!uuid) continue;
    const estatus = fila.estatus === "0" ? "cancelado" : "vigente";
    const existente = await getCfdiDescargado(uuid, empresa.id);

    if (existente) {
      if (existente.estatusSat === "vigente" && estatus === "cancelado") {
        cancelados++;
        existente.estatusSat = "cancelado";
        existente.actualizadoEl = new Date().toISOString();
        await upsertCfdiDescargado(existente);
        if (!(await existeAlerta(empresa.despachoId, "cancelado", uuid))) {
          await crearAlerta({
            despachoId: empresa.despachoId,
            empresaId: empresa.id,
            tipo: "cancelado",
            severidad: tipo === "recibida" ? "critica" : "aviso",
            titulo:
              tipo === "recibida"
                ? `Un proveedor canceló un CFDI que tenías registrado`
                : `CFDI emitido aparece cancelado en el SAT`,
            detalle: `El CFDI ${uuid} de ${fila.rfcEmisor} por $${fila.monto} cambió a CANCELADO según la metadata del SAT. Si ya lo habías deducido o contabilizado, ajústalo.`,
            uuid,
          });
        }
      }
    } else {
      nuevos++;
      await upsertCfdiDescargado({
        uuid,
        empresaId: empresa.id,
        tipo,
        emisorRfc: (fila.rfcEmisor ?? "").toUpperCase(),
        emisorNombre: fila.nombreEmisor,
        receptorRfc: (fila.rfcReceptor ?? "").toUpperCase(),
        receptorNombre: fila.nombreReceptor,
        fecha: fila.fechaEmision ?? "",
        total: Number(fila.monto ?? 0),
        estatusSat: estatus,
        efos: null,
        deducible: "ok",
        actualizadoEl: new Date().toISOString(),
      });
    }
  }
  return { nuevos, cancelados };
}

/** Ingesta el contenido de una solicitud de descarga masiva ya descargada. */
export async function ingerirSolicitud(
  empresa: Emisor,
  solicitud: SolicitudDescarga,
): Promise<{ xmls: number; metadata: number; cancelados: number; errores: number }> {
  const tipo = solicitud.tipo === "emitidas" ? "emitida" : "recibida";
  let xmls = 0;
  let metadata = 0;
  let cancelados = 0;
  let errores = 0;

  for (const paquete of solicitud.paquetes) {
    if (!paquete.zipPath) continue;
    const contenido = await leerPaquete(paquete.zipPath, solicitud.formato);
    for (const archivo of contenido.archivos) {
      if (!archivo.contenido) continue;
      try {
        await ingerirXml(empresa, tipo, archivo.contenido);
        xmls++;
      } catch {
        errores++;
      }
    }
    if (contenido.metadata.length) {
      const r = await conciliarMetadata(empresa, tipo, contenido.metadata);
      metadata += contenido.metadata.length;
      cancelados += r.cancelados;
    }
  }

  solicitud.ingerida = true;
  solicitud.actualizadoEl = new Date().toISOString();
  await guardarDescarga(solicitud);
  return { xmls, metadata, cancelados, errores };
}
