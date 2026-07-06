import { ok, fail } from "@/lib/api-helpers";
import { requireCtx, requireEmpresa, authFail } from "@/lib/auth";
import { actualizarEmpresa, certificadoPublico } from "@/lib/repos";
import { parseCertificado, llaveCorrespondeACertificado } from "@/lib/sat/certificados";
import { encryptSecret } from "@/lib/secret";
import type { CertificadoInfo } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

// Alta de certificados de la empresa: CSD (para sellar CFDI) o FIEL (para descarga
// masiva). Valida contraseña, correspondencia .cer/.key, RFC y vigencia.

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx();
    const { id } = await params;
    const empresa = await requireEmpresa(ctx, id);

    const form = await req.formData();
    const tipo = String(form.get("tipo") || "").toLowerCase();
    const cerFile = form.get("cer");
    const keyFile = form.get("key");
    const password = String(form.get("password") || "");

    if (tipo !== "csd" && tipo !== "fiel") return fail("Tipo de certificado inválido (csd o fiel).");
    if (!(cerFile instanceof File) || !(keyFile instanceof File)) {
      return fail("Debes subir el archivo .cer y el archivo .key.");
    }
    if (!password) return fail("Ingresa la contraseña de la llave privada.");

    const cerBuf = Buffer.from(await cerFile.arrayBuffer());
    const keyBuf = Buffer.from(await keyFile.arrayBuffer());

    const datos = parseCertificado(cerBuf);
    const advertencias: string[] = [];

    if (!llaveCorrespondeACertificado(cerBuf, keyBuf, password)) {
      return fail("La llave privada (.key) no corresponde al certificado (.cer). Verifica que ambos archivos sean del mismo juego.");
    }

    if (datos.rfc && datos.rfc !== empresa.rfc) {
      return fail(`El certificado pertenece al RFC ${datos.rfc}, pero la empresa está registrada con ${empresa.rfc}.`);
    }

    const tipoDetectado = datos.tipo === "FIEL" ? "fiel" : "csd";
    if (tipoDetectado !== tipo) {
      advertencias.push(
        tipo === "csd"
          ? "Este archivo parece ser una FIEL (e.firma), no un CSD. El SAT rechaza CFDI sellados con la FIEL."
          : "Este archivo parece ser un CSD, no una FIEL. La descarga masiva requiere la e.firma.",
      );
    }
    if (!datos.vigente) {
      advertencias.push(
        `El certificado NO está vigente (vigencia: ${datos.validoDesde.toLocaleDateString("es-MX")} — ${datos.validoHasta.toLocaleDateString("es-MX")}).`,
      );
    }

    const info: CertificadoInfo = {
      tipo: tipo === "csd" ? "CSD" : "FIEL",
      // Se almacenan en la base de datos (base64), sin archivos físicos, para
      // poder trabajar en local y en producción con los mismos datos.
      cerB64: cerBuf.toString("base64"),
      keyB64: keyBuf.toString("base64"),
      passwordEnc: encryptSecret(password),
      noCertificado: datos.noCertificado,
      rfc: datos.rfc,
      nombre: datos.nombre,
      curp: datos.curp,
      validoDesde: datos.validoDesde.toISOString(),
      validoHasta: datos.validoHasta.toISOString(),
      emisorCert: datos.emisorCert,
      vigente: datos.vigente,
      subidoEl: new Date().toISOString(),
    };

    if (tipo === "csd") empresa.csd = info;
    else empresa.fiel = info;
    await actualizarEmpresa(empresa);

    return ok({ certificado: certificadoPublico(info), advertencias });
  } catch (e) {
    return authFail(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const ctx = await requireCtx(["admin", "supervisor"]);
    const { id } = await params;
    const empresa = await requireEmpresa(ctx, id);
    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo");
    if (tipo !== "csd" && tipo !== "fiel") return fail("Indica el tipo: csd o fiel.");
    if (tipo === "csd") empresa.csd = null;
    else empresa.fiel = null;
    await actualizarEmpresa(empresa);
    return ok({ eliminado: true });
  } catch (e) {
    return authFail(e);
  }
}
