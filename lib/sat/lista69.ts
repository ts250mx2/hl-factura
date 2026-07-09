import {
  reemplazarLista69,
  buscarLista69,
  estadoLista69,
  emisoresRecibidosDistintos,
  empresasQueRecibieronDe,
  crearAlerta,
  existeAlertaEmpresa,
  getEmpresa,
} from "../repos";
import { parseCsvLinea, RFC_RE } from "./efos";

// Monitoreo del Artículo 69 del CFF (la "lista negra" de incumplidos): el SAT
// publica, por categoría, a los contribuyentes no localizados o con créditos
// firmes/cancelados/exigibles/condonados y sentencias. A diferencia del 69-B
// (EFOS), el 69 NO bloquea la deducción, pero es una señal de riesgo de
// materialidad: si un proveedor tuyo aparece, conviene revisar la operación.

const BASE = "https://omawww.sat.gob.mx/cifras_sat/Documents";

// Un archivo CSV por categoría (supuesto). Nombres del conjunto de datos abiertos
// del Artículo 69. Se puede sobreescribir con SAT_LISTA69_URLS (coma-separado,
// como "Supuesto|url").
const CATEGORIAS: { supuesto: string; archivo: string }[] = [
  { supuesto: "No localizado", archivo: "No_localizados.csv" },
  { supuesto: "Crédito firme", archivo: "Firmes.csv" },
  { supuesto: "Crédito exigible", archivo: "Exigibles.csv" },
  { supuesto: "Crédito cancelado", archivo: "Cancelados.csv" },
  { supuesto: "Condonado", archivo: "Condonados.csv" },
  { supuesto: "Sentencia condenatoria", archivo: "Sentencias.csv" },
];

interface Fuente {
  supuesto: string;
  url: string;
}

function fuentes(): Fuente[] {
  const override = (process.env.SAT_LISTA69_URLS || "").trim();
  if (override) {
    return override
      .split(",")
      .map((par) => par.trim())
      .filter(Boolean)
      .map((par) => {
        const [supuesto, url] = par.split("|");
        return { supuesto: (supuesto || "Artículo 69").trim(), url: (url || "").trim() };
      })
      .filter((f) => f.url);
  }
  return CATEGORIAS.map((c) => ({ supuesto: c.supuesto, url: `${BASE}/${c.archivo}` }));
}

/** Descarga y parsea un CSV del Artículo 69, detectando las columnas RFC/nombre. */
async function descargarArchivo(url: string, supuesto: string): Promise<{ rfc: string; nombre: string; supuesto: string }[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const texto = Buffer.from(await res.arrayBuffer()).toString("latin1"); // el SAT publica en latin1
  const lineas = texto.split(/\r?\n/);

  // Detectar columnas por encabezado (RFC y nombre/razón social).
  let idxRfc = 1;
  let idxNombre = 2;
  for (const linea of lineas.slice(0, 6)) {
    const campos = parseCsvLinea(linea).map((c) => c.trim().toLowerCase());
    const posRfc = campos.findIndex((c) => c === "rfc");
    if (posRfc >= 0) {
      idxRfc = posRfc;
      const posNombre = campos.findIndex((c) => c.includes("nombre") || c.includes("raz") || c.includes("denominaci"));
      if (posNombre >= 0) idxNombre = posNombre;
      break;
    }
  }

  const out: { rfc: string; nombre: string; supuesto: string }[] = [];
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const campos = parseCsvLinea(linea);
    const rfc = (campos[idxRfc] ?? "").trim().toUpperCase();
    if (!RFC_RE.test(rfc)) continue;
    out.push({ rfc, nombre: (campos[idxNombre] ?? "").trim(), supuesto });
  }
  return out;
}

export interface ResultadoLista69 {
  total: number; // RFCs distintos
  registros: number; // filas (un RFC puede estar en varias categorías)
  categorias: number; // archivos descargados con éxito
  fallidas: string[]; // categorías que no se pudieron descargar
  afectados: number; // proveedores tuyos que aparecen en la lista
}

export async function actualizarLista69(): Promise<ResultadoLista69> {
  const dedup = new Map<string, { rfc: string; nombre: string; supuesto: string }>();
  const fallidas: string[] = [];
  const supuestosOk: string[] = [];
  for (const f of fuentes()) {
    try {
      const filas = await descargarArchivo(f.url, f.supuesto);
      if (filas.length === 0) throw new Error("CSV sin registros reconocibles");
      for (const fila of filas) dedup.set(`${fila.rfc}|${fila.supuesto}`, fila);
      supuestosOk.push(f.supuesto);
    } catch (e) {
      fallidas.push(`${f.supuesto} (${e instanceof Error ? e.message : e})`);
    }
  }
  if (supuestosOk.length === 0) {
    throw new Error(`No se pudo descargar ninguna categoría del Artículo 69 del SAT: ${fallidas.join("; ")}`);
  }
  const lista = [...dedup.values()];
  // Reemplaza solo las categorías que sí se bajaron: una falla parcial no borra
  // los RFCs de las categorías que quedaron sin actualizar.
  await reemplazarLista69(lista, supuestosOk);
  const afectados = await revisarBovedaContra69();
  const { total } = await estadoLista69();
  return { total, registros: lista.length, categorias: supuestosOk.length, fallidas, afectados };
}

/** Cruza los proveedores de la bóveda contra el Artículo 69 y genera avisos. */
export async function revisarBovedaContra69(): Promise<number> {
  const emisores = await emisoresRecibidosDistintos();
  if (emisores.length === 0) return 0;
  const encontrados = await buscarLista69(emisores);
  if (encontrados.size === 0) return 0;

  const receptores = await empresasQueRecibieronDe([...encontrados.keys()]);
  let avisos = 0;
  for (const rec of receptores) {
    const supuestos = encontrados.get(rec.emisorRfc);
    if (!supuestos) continue;
    const empresa = await getEmpresa(rec.empresaId);
    if (!empresa) continue;
    // Dedup por (empresa, RFC del proveedor): en un despacho multi-empresa que
    // comparte proveedor, cada empresa afectada recibe su propio aviso.
    if (await existeAlertaEmpresa(empresa.despachoId, rec.empresaId, "deduccion", rec.emisorRfc)) continue;
    await crearAlerta({
      despachoId: empresa.despachoId,
      empresaId: rec.empresaId,
      tipo: "deduccion",
      severidad: "aviso",
      titulo: `Proveedor en la lista del Artículo 69: ${rec.emisorNombre || rec.emisorRfc}`,
      detalle: `El proveedor ${rec.emisorRfc} aparece en el listado del Artículo 69 del SAT como «${supuestos.join(", ")}». El 69 no bloquea la deducción (a diferencia del 69-B/EFOS), pero es una señal de riesgo: revisa la materialidad de tus operaciones con él.`,
      uuid: rec.emisorRfc,
    });
    avisos++;
  }
  return avisos;
}

/** Consulta un RFC contra la lista del 69 (devuelve las categorías en que aparece). */
export async function consultarLista69(rfc: string): Promise<string[]> {
  const m = await buscarLista69([rfc.toUpperCase()]);
  return m.get(rfc.toUpperCase()) ?? [];
}
