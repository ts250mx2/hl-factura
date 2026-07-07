import crypto from "crypto";
import {
  guardarCliente,
  getClientePorRfc,
  guardarProducto,
  guardarFactura,
  getFacturaPorUuid,
  guardarPagoRep,
  getPagoRepPorUuid,
  listarBoveda,
} from "../repos";
import { leerXml, idCfdi } from "../archivos";
import { parseCfdiCompleto, type CfdiCompleto, type ConceptoParsed } from "./cfdi-parse";
import type { Cliente, Producto, Factura, PagoRep, ConceptoFactura, DoctoPago, Emisor } from "../types";

// Derivación de un CFDI de la bóveda a las páginas de operación:
//  - Emitidas (I/E):  factura (mía) + cliente (receptor) + productos (conceptos)
//  - Emitidas (P):    complemento de pago (REP) + cliente
//  - Recibidas (I/E): proveedor (emisor)   [cuentas por pagar ya deriva de la bóveda]
//  - Recibidas (P):   proveedor (emisor)
// Todo se marca con origen "descarga" y es de solo lectura en la app.

const ahoraIso = () => new Date().toISOString();

function productoIdDe(empresaId: string, con: ConceptoParsed): string {
  const clave = `${con.claveProdServ}|${con.noIdentificacion ?? ""}|${con.descripcion}`.toLowerCase();
  return "sat-" + crypto.createHash("md5").update(`${empresaId}|${clave}`).digest("hex"); // 4 + 32 = 36
}

/** Alta/actualización de la contraparte (cliente o proveedor). Devuelve su id. */
async function upsertContraparte(
  empresa: Emisor,
  rfc: string,
  nombre: string | undefined,
  relacion: "cliente" | "proveedor",
  c: CfdiCompleto,
): Promise<string> {
  const esCliente = relacion === "cliente";
  const regimen = esCliente ? c.receptorRegimen : c.emisorRegimen;
  const cp = esCliente ? c.receptorCp : undefined;
  const uso = esCliente ? c.usoCfdi : undefined;

  const existente = await getClientePorRfc(empresa.id, rfc);
  if (existente) {
    const relacionFinal =
      existente.relacion && existente.relacion !== relacion ? "ambos" : (existente.relacion ?? relacion);
    const actualizado: Cliente = {
      ...existente,
      nombre: existente.nombre || nombre || rfc,
      regimenFiscal: existente.regimenFiscal || regimen || "",
      codigoPostal: existente.codigoPostal || cp || "",
      usoCfdi: existente.usoCfdi || uso || "",
      relacion: relacionFinal,
      // Preserva el origen previo: no re-etiqueta como "descarga" a un cliente
      // capturado a mano.
      origen: existente.origen ?? "manual",
    };
    await guardarCliente(actualizado);
    return existente.id;
  }

  const cliente: Cliente = {
    id: crypto.randomUUID(),
    empresaId: empresa.id,
    rfc,
    nombre: nombre || rfc,
    regimenFiscal: regimen || "",
    codigoPostal: cp || "",
    usoCfdi: uso || "",
    origen: "descarga",
    relacion,
    creadoEl: ahoraIso(),
  };
  await guardarCliente(cliente);
  return cliente.id;
}

async function upsertProducto(empresa: Emisor, con: ConceptoParsed): Promise<void> {
  if (!con.descripcion && !con.claveProdServ) return;
  const producto: Producto = {
    id: productoIdDe(empresa.id, con),
    empresaId: empresa.id,
    claveProdServ: con.claveProdServ,
    claveUnidad: con.claveUnidad,
    unidad: con.unidad,
    noIdentificacion: con.noIdentificacion,
    descripcion: con.descripcion || con.claveProdServ,
    valorUnitario: con.valorUnitario,
    objetoImp: con.objetoImp,
    impuestos: con.impuestos,
    origen: "descarga",
    creadoEl: ahoraIso(),
  };
  await guardarProducto(producto);
}

function aConceptoFactura(empresaId: string, con: ConceptoParsed): ConceptoFactura {
  return {
    productoId: productoIdDe(empresaId, con),
    claveProdServ: con.claveProdServ,
    claveUnidad: con.claveUnidad,
    unidad: con.unidad,
    noIdentificacion: con.noIdentificacion,
    descripcion: con.descripcion,
    cantidad: con.cantidad,
    valorUnitario: con.valorUnitario,
    descuento: con.descuento,
    objetoImp: con.objetoImp,
    impuestos: con.impuestos,
    importe: con.importe,
    base: con.base,
    ivaImporte: con.ivaImporte,
    retIvaImporte: con.retIvaImporte,
    retIsrImporte: con.retIsrImporte,
    iepsImporte: con.iepsImporte,
  };
}

async function upsertFacturaDescargada(empresa: Emisor, c: CfdiCompleto, clienteId: string): Promise<void> {
  const existente = await getFacturaPorUuid(empresa.id, c.uuid);
  // No sobre-escribir una factura emitida desde el sistema.
  if (existente && existente.origen !== "descarga") return;
  const factura: Factura = {
    id: existente?.id ?? c.uuid,
    emisorId: empresa.id,
    clienteId,
    serie: c.serie ?? "",
    folio: c.folio ?? "",
    fecha: c.fecha,
    tipoDeComprobante: c.tipoComprobante === "E" ? "E" : "I",
    formaPago: c.formaPago ?? "",
    metodoPago: c.metodoPago ?? "",
    moneda: c.moneda ?? "MXN",
    tipoCambio: c.tipoCambio,
    usoCfdi: c.usoCfdi ?? "",
    conceptos: c.conceptos.map((con) => aConceptoFactura(empresa.id, con)),
    subTotal: c.subTotal,
    descuento: c.descuento,
    totalTraslados: c.totalTraslados,
    totalRetenciones: c.totalRetenciones,
    total: c.total,
    estado: "timbrada",
    demo: false,
    origen: "descarga",
    uuid: c.uuid,
    fechaTimbrado: c.fechaTimbrado,
    xmlPath: idCfdi(empresa.id, c.uuid),
    emisorRfc: c.emisorRfc,
    emisorNombre: c.emisorNombre ?? "",
    receptorRfc: c.receptorRfc,
    receptorNombre: c.receptorNombre ?? "",
    creadoEl: existente?.creadoEl ?? ahoraIso(),
  };
  await guardarFactura(factura);
}

async function upsertPagoDescargado(empresa: Emisor, c: CfdiCompleto, clienteId: string): Promise<void> {
  if (c.pagos.length === 0) return;
  const existente = await getPagoRepPorUuid(empresa.id, c.uuid);
  if (existente && existente.origen !== "descarga") return;
  const doctos: DoctoPago[] = [];
  let monto = 0;
  for (const p of c.pagos) {
    monto += p.monto;
    for (const d of p.doctos) {
      doctos.push({
        facturaId: d.facturaId,
        uuid: d.uuid,
        serie: d.serie,
        folio: d.folio,
        parcialidad: d.parcialidad,
        saldoAnterior: d.saldoAnterior,
        pagado: d.pagado,
        saldoInsoluto: d.saldoInsoluto,
        objetoImpDR: d.objetoImpDR,
        impuestos: d.impuestos,
      });
    }
  }
  const primero = c.pagos[0];
  const pago: PagoRep = {
    id: existente?.id ?? c.uuid,
    empresaId: empresa.id,
    clienteId,
    serie: c.serie ?? "",
    folio: c.folio ?? "",
    fechaPago: primero.fechaPago || c.fecha,
    formaPago: primero.formaPago || "",
    moneda: primero.moneda || "MXN",
    monto: monto || c.total,
    doctos,
    estado: "timbrada",
    demo: false,
    origen: "descarga",
    uuid: c.uuid,
    fechaTimbrado: c.fechaTimbrado,
    xmlPath: idCfdi(empresa.id, c.uuid),
    emisorRfc: c.emisorRfc,
    emisorNombre: c.emisorNombre ?? "",
    receptorRfc: c.receptorRfc,
    receptorNombre: c.receptorNombre ?? "",
    creadoEl: existente?.creadoEl ?? ahoraIso(),
  };
  await guardarPagoRep(pago);
}

/** Deriva un CFDI (ya en la bóveda) a las páginas de operación. */
export async function derivarDeCfdi(empresa: Emisor, tipo: "emitida" | "recibida", xml: string): Promise<void> {
  const c = parseCfdiCompleto(xml);
  const esEmitida = tipo === "emitida";
  const tc = c.tipoComprobante;

  // Contraparte: en emitidas es el receptor (cliente); en recibidas, el emisor
  // (proveedor). Se ignora si coincide con la propia empresa.
  const contraRfc = (esEmitida ? c.receptorRfc : c.emisorRfc) || "";
  const contraNombre = esEmitida ? c.receptorNombre : c.emisorNombre;
  let clienteId = "";
  if (contraRfc && contraRfc !== empresa.rfc) {
    clienteId = await upsertContraparte(empresa, contraRfc, contraNombre, esEmitida ? "cliente" : "proveedor", c);
  }

  if (esEmitida && (tc === "I" || tc === "E")) {
    for (const con of c.conceptos) await upsertProducto(empresa, con);
    await upsertFacturaDescargada(empresa, c, clienteId);
  } else if (esEmitida && tc === "P") {
    await upsertPagoDescargado(empresa, c, clienteId);
  }
}

/** Vuelve a derivar todos los CFDI ya guardados en la bóveda de una empresa
 *  (para poblar la operación con lo que se descargó antes de esta función). */
export async function derivarBovedaExistente(empresa: Emisor): Promise<{ procesados: number; errores: number }> {
  const cfdis = await listarBoveda([empresa.id], { limite: 1000 });
  let procesados = 0;
  let errores = 0;
  for (const c of cfdis) {
    const xml = await leerXml(c.xmlPath ?? idCfdi(empresa.id, c.uuid));
    if (!xml) continue; // solo metadata, sin XML
    try {
      await derivarDeCfdi(empresa, c.tipo, xml);
      procesados++;
    } catch {
      errores++;
    }
  }
  return { procesados, errores };
}
