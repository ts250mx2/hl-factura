import fs from "fs";
import path from "path";
import { CFDI_DIR, ensureDirs } from "./db";
import {
  genId,
  getCliente,
  getFactura,
  getConfigPac,
  guardarPagoRep,
  incrementarFolioPago,
  saldosDeFacturas,
} from "./repos";
import type { Emisor, Factura, PagoRep, DoctoPago } from "./types";
import { ErrorValidacion } from "./emision";
import { round2, fechaCfdi } from "./sat/importes";
import { parseCertificado, sellarCadena, verificarSello } from "./sat/certificados";
import { bytesCertificado } from "./sat/cert-bytes";
import { decryptSecret } from "./secret";
import {
  construirComprobantePago,
  impuestosProporcionales,
  agregarImpuestosPago,
  cadenaOriginalPago,
  xmlPagoCompleto,
} from "./sat/pagos20";
import { timbrar } from "./sat/timbrado";
import { FORMAS_PAGO } from "./sat/catalogos";

export interface NuevoPagoInput {
  clienteId: string;
  fechaPago: string; // YYYY-MM-DD
  formaPago: string;
  doctos: { facturaId: string; pagado: number }[];
}

/** Emite un CFDI de pago (REP 2.0) contra facturas PPD con saldo. */
export async function emitirPago(input: NuevoPagoInput, empresa: Emisor): Promise<PagoRep> {
  const errores: string[] = [];
  const cliente = await getCliente(input.clienteId);
  if (!cliente || cliente.empresaId !== empresa.id) {
    throw new ErrorValidacion(["Selecciona un cliente válido de esta empresa."]);
  }
  if (!empresa.csd) throw new ErrorValidacion(["La empresa no tiene CSD para sellar el complemento."]);
  if (!input.doctos?.length) throw new ErrorValidacion(["Selecciona al menos una factura a pagar."]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaPago)) errores.push("Indica la fecha en que recibiste el pago.");
  if (new Date(input.fechaPago + "T00:00:00") > new Date()) errores.push("La fecha de pago no puede ser futura.");
  if (!FORMAS_PAGO.some((f) => f.clave === input.formaPago) || input.formaPago === "99") {
    errores.push("Indica la forma de pago real recibida (no puede ser 99).");
  }

  // Cargar facturas y validar saldos
  const facturas: Factura[] = [];
  for (const d of input.doctos) {
    const f = await getFactura(d.facturaId);
    if (!f) {
      errores.push("Una de las facturas seleccionadas ya no existe.");
      continue;
    }
    if (f.emisorId !== empresa.id) errores.push(`La factura ${f.serie}-${f.folio} no es de esta empresa.`);
    if (f.clienteId !== cliente.id) errores.push(`La factura ${f.serie}-${f.folio} no es de este cliente.`);
    if (f.estado !== "timbrada") errores.push(`La factura ${f.serie}-${f.folio} no está timbrada.`);
    if (f.metodoPago !== "PPD") errores.push(`La factura ${f.serie}-${f.folio} es PUE: no lleva complemento de pago.`);
    if (f.moneda !== "MXN") errores.push(`La factura ${f.serie}-${f.folio} no es MXN (v1 del REP solo soporta MXN).`);
    facturas.push(f);
  }
  if (errores.length) throw new ErrorValidacion(errores);

  const saldos = await saldosDeFacturas(facturas.map((f) => f.id));
  const doctos: DoctoPago[] = [];
  let monto = 0;

  for (const d of input.doctos) {
    const f = facturas.find((x) => x.id === d.facturaId)!;
    const previo = saldos.get(f.id) ?? { pagado: 0, parcialidades: 0 };
    const saldoAnterior = round2(f.total - previo.pagado);
    const pagado = round2(Number(d.pagado));
    if (!(pagado > 0)) errores.push(`Indica el monto pagado de ${f.serie}-${f.folio}.`);
    else if (pagado > saldoAnterior + 0.005) {
      errores.push(
        `El pago de ${f.serie}-${f.folio} ($${pagado.toFixed(2)}) excede su saldo ($${saldoAnterior.toFixed(2)}).`,
      );
    }
    const impuestos = impuestosProporcionales(f, pagado);
    doctos.push({
      facturaId: f.id,
      uuid: f.uuid!,
      serie: f.serie || undefined,
      folio: f.folio || undefined,
      parcialidad: previo.parcialidades + 1,
      saldoAnterior,
      pagado,
      saldoInsoluto: round2(saldoAnterior - pagado),
      objetoImpDR: impuestos.length ? "02" : "01",
      impuestos,
    });
    monto = round2(monto + pagado);
  }
  if (errores.length) throw new ErrorValidacion(errores);

  const pago: PagoRep = {
    id: genId(),
    empresaId: empresa.id,
    clienteId: cliente.id,
    serie: "P",
    folio: String(empresa.folioPagoActual),
    fechaPago: `${input.fechaPago}T12:00:00`,
    formaPago: input.formaPago,
    moneda: "MXN",
    monto,
    doctos,
    estado: "borrador",
    demo: false,
    emisorRfc: empresa.rfc,
    emisorNombre: empresa.nombre,
    receptorRfc: cliente.rfc,
    receptorNombre: cliente.nombre,
    creadoEl: new Date().toISOString(),
  };

  // Sellado
  const { cer: cerBuffer, key: keyBuffer } = bytesCertificado(empresa, "csd");
  const password = decryptSecret(empresa.csd.passwordEnc);
  const cert = parseCertificado(cerBuffer);

  const comprobante = construirComprobantePago(
    empresa, cliente, pago, fechaCfdi(), cert.certificadoBase64, cert.noCertificado,
  );
  const agregados = agregarImpuestosPago(pago);
  const cadena = cadenaOriginalPago(comprobante, pago, agregados);
  const sello = sellarCadena(keyBuffer, password, cadena);
  if (!verificarSello(cert.certificadoBase64, cadena, sello)) {
    throw new Error("El sello del complemento no pudo verificarse contra el certificado.");
  }
  comprobante.Sello = sello;
  pago.cadenaOriginal = cadena;
  pago.selloCFD = sello;
  pago.noCertificado = cert.noCertificado;
  pago.estado = "sellada";

  const xmlSellado = xmlPagoCompleto(comprobante, pago, agregados);
  ensureDirs();
  const xmlPath = path.join(CFDI_DIR, `rep-${pago.id}.xml`);

  // Timbrado
  const pac = await getConfigPac(empresa.despachoId);
  try {
    const timbre = await timbrar(xmlSellado, pac);
    pago.uuid = timbre.uuid;
    pago.fechaTimbrado = timbre.fechaTimbrado;
    pago.selloSAT = timbre.selloSAT;
    pago.noCertificadoSAT = timbre.noCertificadoSAT;
    pago.rfcProvCertif = timbre.rfcProvCertif;
    pago.demo = timbre.demo;
    pago.estado = "timbrada";
    fs.writeFileSync(xmlPath, timbre.xmlTimbrado, "utf8");
  } catch (e) {
    pago.estado = "error";
    pago.errorMsg = e instanceof Error ? e.message : "Error al timbrar";
    fs.writeFileSync(xmlPath, xmlSellado, "utf8");
  }
  pago.xmlPath = xmlPath;

  await guardarPagoRep(pago);
  await incrementarFolioPago(empresa.id);
  return pago;
}
