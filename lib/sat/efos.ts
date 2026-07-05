import {
  reemplazarEfos,
  buscarEfos,
  estadoEfos,
  emisoresRecibidosDistintos,
  cfdisRecibidosPorEmisor,
  upsertCfdiDescargado,
  crearAlerta,
  existeAlerta,
  getEmpresa,
} from "../repos";

// Monitoreo del Artículo 69-B (EFOS): el SAT publica la lista de contribuyentes
// que facturan operaciones simuladas. Un CFDI recibido de un proveedor
// "Presunto" o "Definitivo" se bloquea para deducción y genera alerta.

const URLS_69B = [
  "https://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv",
  "http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv",
];

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2}[0-9A]$/;

/** Parser CSV mínimo con soporte de comillas (los nombres traen comas). */
function parseCsvLinea(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else enComillas = false;
      } else actual += ch;
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === ",") {
      campos.push(actual);
      actual = "";
    } else actual += ch;
  }
  campos.push(actual);
  return campos;
}

function normalizarSituacion(s: string): string {
  const limpio = s.trim().toLowerCase();
  if (limpio.startsWith("definitivo")) return "Definitivo";
  if (limpio.startsWith("presunto")) return "Presunto";
  if (limpio.startsWith("desvirtuado")) return "Desvirtuado";
  if (limpio.includes("favorable")) return "Sentencia Favorable";
  return s.trim().slice(0, 38);
}

export function situacionBloquea(situacion?: string | null): boolean {
  return situacion === "Presunto" || situacion === "Definitivo";
}

export async function descargarListaEfos(): Promise<{ rfc: string; nombre: string; situacion: string }[]> {
  let ultimoError: unknown = null;
  for (const url of URLS_69B) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // El SAT publica el CSV en latin1
      const texto = buf.toString("latin1");
      const lineas = texto.split(/\r?\n/);

      // Detectar los índices de columna a partir del encabezado
      let idxRfc = 1;
      let idxNombre = 2;
      let idxSituacion = 3;
      for (const linea of lineas.slice(0, 5)) {
        const campos = parseCsvLinea(linea).map((c) => c.trim().toLowerCase());
        const posRfc = campos.findIndex((c) => c === "rfc");
        if (posRfc >= 0) {
          idxRfc = posRfc;
          const posNombre = campos.findIndex((c) => c.includes("nombre"));
          const posSituacion = campos.findIndex((c) => c.includes("situaci"));
          if (posNombre >= 0) idxNombre = posNombre;
          if (posSituacion >= 0) idxSituacion = posSituacion;
          break;
        }
      }

      const lista: { rfc: string; nombre: string; situacion: string }[] = [];
      for (const linea of lineas) {
        if (!linea.trim()) continue;
        const campos = parseCsvLinea(linea);
        const rfc = (campos[idxRfc] ?? "").trim().toUpperCase();
        if (!RFC_RE.test(rfc)) continue;
        lista.push({
          rfc,
          nombre: (campos[idxNombre] ?? "").trim(),
          situacion: normalizarSituacion(campos[idxSituacion] ?? ""),
        });
      }
      if (lista.length === 0) throw new Error("El CSV no contenía registros reconocibles");
      return lista;
    } catch (e) {
      ultimoError = e;
    }
  }
  throw new Error(
    `No se pudo descargar la lista 69-B del SAT: ${ultimoError instanceof Error ? ultimoError.message : ultimoError}`,
  );
}

/** Descarga la lista 69-B, la guarda y revisa la bóveda contra ella. */
export async function actualizarListaEfos(): Promise<{ total: number; afectados: number }> {
  const lista = await descargarListaEfos();
  await reemplazarEfos(lista);
  const afectados = await revisarBovedaContraEfos();
  return { total: lista.length, afectados };
}

/**
 * Cruza los CFDI recibidos de la bóveda contra la lista EFOS vigente.
 * Marca como bloqueados los de proveedores Presuntos/Definitivos y alerta.
 */
export async function revisarBovedaContraEfos(): Promise<number> {
  const emisores = await emisoresRecibidosDistintos();
  if (emisores.length === 0) return 0;
  const situaciones = await buscarEfos(emisores);
  const enLista = [...situaciones.entries()].filter(([, s]) => situacionBloquea(s)).map(([rfc]) => rfc);
  if (enLista.length === 0) return 0;

  const afectados = await cfdisRecibidosPorEmisor(enLista);
  for (const cfdi of afectados) {
    const situacion = situaciones.get(cfdi.emisorRfc)!;
    cfdi.efos = situacion.toLowerCase() as "presunto" | "definitivo";
    cfdi.deducible = "bloqueado_efos";
    cfdi.motivoNoDeducible = `El emisor ${cfdi.emisorRfc} aparece como "${situacion}" en la lista 69-B del SAT`;
    cfdi.actualizadoEl = new Date().toISOString();
    await upsertCfdiDescargado(cfdi);

    const empresa = await getEmpresa(cfdi.empresaId);
    if (empresa && !(await existeAlerta(empresa.despachoId, "efos", cfdi.uuid))) {
      await crearAlerta({
        despachoId: empresa.despachoId,
        empresaId: cfdi.empresaId,
        tipo: "efos",
        severidad: "critica",
        titulo: `Proveedor en lista 69-B (${situacion}): ${cfdi.emisorNombre || cfdi.emisorRfc}`,
        detalle: `El CFDI ${cfdi.uuid} por $${cfdi.total.toFixed(2)} recibido de ${cfdi.emisorRfc} quedó BLOQUEADO para deducción: el emisor aparece como "${situacion}" en el listado del Artículo 69-B. Revisa la materialidad de la operación con tu contador.`,
        uuid: cfdi.uuid,
      });
    }
  }
  return afectados.length;
}

export { estadoEfos, buscarEfos };
