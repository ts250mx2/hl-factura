// Consulta del estatus de un CFDI directamente en el servicio público del SAT
// (ConsultaCFDIService). No requiere certificados: usa la "expresión impresa"
// del comprobante (la misma que va en el QR de la representación impresa).

export interface EstatusSat {
  codigoEstatus: string; // p. ej. "S - Comprobante obtenido satisfactoriamente."
  estado: string; // Vigente | Cancelado | No Encontrado
  esCancelable: string;
  estatusCancelacion: string;
  validacionEfos: string;
}

const SAT_CONSULTA_URL = "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc";

export function expresionImpresa(args: {
  emisorRfc: string;
  receptorRfc: string;
  total: string;
  uuid: string;
  sello: string;
}): string {
  const fe = args.sello.slice(-8);
  return `?re=${args.emisorRfc}&rr=${args.receptorRfc}&tt=${args.total}&id=${args.uuid}&fe=${fe}`;
}

/** URL de verificación pública del SAT (la que abre el QR de la factura). */
export function urlVerificacionSat(args: {
  emisorRfc: string;
  receptorRfc: string;
  total: string;
  uuid: string;
  sello: string;
}): string {
  const fe = encodeURIComponent(args.sello.slice(-8));
  return (
    `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx` +
    `?id=${args.uuid}&re=${args.emisorRfc}&rr=${args.receptorRfc}&tt=${args.total}&fe=${fe}`
  );
}

export async function consultarEstatusSat(args: {
  emisorRfc: string;
  receptorRfc: string;
  total: string;
  uuid: string;
  sello: string;
}): Promise<EstatusSat> {
  const expresion = expresionImpresa(args);
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">` +
    `<soapenv:Header/><soapenv:Body><tem:Consulta><tem:expresionImpresa>` +
    `<![CDATA[${expresion}]]>` +
    `</tem:expresionImpresa></tem:Consulta></soapenv:Body></soapenv:Envelope>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(SAT_CONSULTA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: "http://tempuri.org/IConsultaCFDIService/Consulta",
      },
      body: envelope,
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(
      "No se pudo contactar el servicio del SAT. Verifica tu conexión a internet. " +
        (e instanceof Error ? e.message : ""),
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`El servicio del SAT respondió con error HTTP ${res.status}.`);
  }
  const xml = await res.text();
  const campo = (name: string) => {
    const m = xml.match(new RegExp(`<a:${name}[^>]*>([^<]*)</a:${name}>`));
    return m ? m[1] : "";
  };
  return {
    codigoEstatus: campo("CodigoEstatus"),
    estado: campo("Estado"),
    esCancelable: campo("EsCancelable"),
    estatusCancelacion: campo("EstatusCancelacion") || "—",
    validacionEfos: campo("ValidacionEFOS") || "—",
  };
}
