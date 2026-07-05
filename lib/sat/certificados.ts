import forge from "node-forge";

// Manejo de certificados (.cer) y llaves privadas (.key) emitidos por el SAT.
// Los .cer son X.509 DER; los .key son PKCS#8 cifrados (DER) con la contraseña de la llave.

export interface DatosCertificado {
  noCertificado: string; // serial de 20 dígitos que va en el atributo NoCertificado
  rfc: string;
  nombre: string;
  curp?: string;
  validoDesde: Date;
  validoHasta: Date;
  vigente: boolean;
  emisorCert: string;
  tipo: "CSD" | "FIEL";
  pem: string;
  certificadoBase64: string; // DER en base64, para el atributo Certificado del CFDI
}

const OID_X500_UNIQUE_IDENTIFIER = "2.5.4.45"; // aquí el SAT pone "RFC / CURP"
const OID_SERIAL_NUMBER = "2.5.4.5";
const OID_COMMON_NAME = "2.5.4.3";

function bufferToForge(buf: Buffer): string {
  return buf.toString("binary");
}

function esPem(buf: Buffer): boolean {
  return buf.subarray(0, 200).toString("utf8").includes("-----BEGIN");
}

export function parseCertificado(cer: Buffer): DatosCertificado {
  let cert: forge.pki.Certificate;
  try {
    if (esPem(cer)) {
      cert = forge.pki.certificateFromPem(cer.toString("utf8"));
    } else {
      const asn1 = forge.asn1.fromDer(bufferToForge(cer));
      cert = forge.pki.certificateFromAsn1(asn1);
    }
  } catch {
    throw new Error(
      "No se pudo leer el certificado. Verifica que sea un archivo .cer del SAT (formato X.509 DER).",
    );
  }

  // El serial viene en hexadecimal; el SAT codifica cada dígito como su valor ASCII,
  // por eso se decodifica por pares para obtener el número de 20 dígitos.
  const serialHex = cert.serialNumber.replace(/^0x/i, "");
  let noCertificado = "";
  for (let i = 0; i < serialHex.length; i += 2) {
    noCertificado += String.fromCharCode(parseInt(serialHex.slice(i, i + 2), 16));
  }
  noCertificado = noCertificado.replace(/[^0-9]/g, "");

  const getAttr = (oid: string): string | undefined => {
    const attr = cert.subject.attributes.find((a) => a.type === oid);
    return attr ? String(attr.value) : undefined;
  };

  const uniqueId = getAttr(OID_X500_UNIQUE_IDENTIFIER) || "";
  const [rfcRaw, curpRaw] = uniqueId.split("/").map((s) => s.trim());
  const rfc = (rfcRaw || "").toUpperCase();
  const nombre = getAttr(OID_COMMON_NAME) || "";
  const curp = curpRaw || getAttr(OID_SERIAL_NUMBER) || undefined;

  const issuerCn = cert.issuer.attributes.find((a) => a.type === OID_COMMON_NAME);

  // CSD: keyUsage solo digitalSignature + nonRepudiation.
  // FIEL (e.firma): además incluye keyEncipherment / dataEncipherment / keyAgreement.
  let tipo: "CSD" | "FIEL" = "CSD";
  const ku = cert.getExtension("keyUsage") as
    | { keyEncipherment?: boolean; dataEncipherment?: boolean; keyAgreement?: boolean }
    | undefined;
  if (ku && (ku.keyEncipherment || ku.dataEncipherment || ku.keyAgreement)) {
    tipo = "FIEL";
  }

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const now = new Date();

  return {
    noCertificado,
    rfc,
    nombre,
    curp,
    validoDesde: cert.validity.notBefore,
    validoHasta: cert.validity.notAfter,
    vigente: now >= cert.validity.notBefore && now <= cert.validity.notAfter,
    emisorCert: issuerCn ? String(issuerCn.value) : "SAT",
    tipo,
    pem: forge.pki.certificateToPem(cert),
    certificadoBase64: forge.util.encode64(der),
  };
}

export function parseLlavePrivada(key: Buffer, password: string): forge.pki.rsa.PrivateKey {
  try {
    if (esPem(key)) {
      const pem = key.toString("utf8");
      if (pem.includes("ENCRYPTED")) {
        const pk = forge.pki.decryptRsaPrivateKey(pem, password);
        if (!pk) throw new Error("bad-password");
        return pk as forge.pki.rsa.PrivateKey;
      }
      return forge.pki.privateKeyFromPem(pem) as forge.pki.rsa.PrivateKey;
    }
    const asn1 = forge.asn1.fromDer(bufferToForge(key));
    const decrypted = forge.pki.decryptPrivateKeyInfo(asn1, password);
    if (!decrypted) throw new Error("bad-password");
    return forge.pki.privateKeyFromAsn1(decrypted) as forge.pki.rsa.PrivateKey;
  } catch (e) {
    if (e instanceof Error && e.message === "bad-password") {
      throw new Error("La contraseña de la llave privada es incorrecta.");
    }
    throw new Error(
      "No se pudo leer la llave privada. Verifica que sea el archivo .key del SAT y que la contraseña sea correcta.",
    );
  }
}

/** Comprueba que la llave privada corresponde al certificado (mismo módulo RSA). */
export function llaveCorrespondeACertificado(cer: Buffer, key: Buffer, password: string): boolean {
  const cert = esPem(cer)
    ? forge.pki.certificateFromPem(cer.toString("utf8"))
    : forge.pki.certificateFromAsn1(forge.asn1.fromDer(bufferToForge(cer)));
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const privateKey = parseLlavePrivada(key, password);
  return publicKey.n.compareTo(privateKey.n) === 0;
}

/** Genera el sello digital: SHA-256 + RSA sobre la cadena original, en base64. */
export function sellarCadena(key: Buffer, password: string, cadenaOriginal: string): string {
  const privateKey = parseLlavePrivada(key, password);
  const md = forge.md.sha256.create();
  md.update(cadenaOriginal, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

/** Verifica un sello contra la cadena original usando el certificado. */
export function verificarSello(
  certificadoBase64: string,
  cadenaOriginal: string,
  selloBase64: string,
): boolean {
  try {
    const der = forge.util.decode64(certificadoBase64);
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der));
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    const md = forge.md.sha256.create();
    md.update(cadenaOriginal, "utf8");
    return publicKey.verify(md.digest().getBytes(), forge.util.decode64(selloBase64));
  } catch {
    return false;
  }
}
