import type { CuentaContable } from "../types";
import type { Balanza } from "./balanza";
import { escapeXml } from "../sat/cfdi";

// Contabilidad electrónica (Anexo 24 del SAT): XML del catálogo de cuentas
// (CatalogoCuentas 1.3) y de la balanza de comprobación (BalanzaComprobacion 1.3).
// Nomenclatura de archivos: RFC + AAAA + MM + CT.xml / + BN.xml

const f2 = (n: number) => n.toFixed(2);

export function xmlCatalogoCuentas(rfc: string, anio: string, mes: string, cuentas: CuentaContable[]): string {
  const lineas: string[] = [];
  lineas.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lineas.push(
    `<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas` +
      ` http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd"` +
      ` Version="1.3" RFC="${escapeXml(rfc)}" Mes="${mes}" Anio="${anio}">`,
  );
  for (const c of cuentas) {
    lineas.push(
      `  <catalogocuentas:Ctas CodAgrup="${escapeXml(c.codigoAgrupador)}" NumCta="${escapeXml(c.codigo)}"` +
        ` Desc="${escapeXml(c.nombre)}" Nivel="${c.nivel}" Natur="${c.naturaleza}"/>`,
    );
  }
  lineas.push(`</catalogocuentas:Catalogo>`);
  return lineas.join("\n");
}

export function xmlBalanzaComprobacion(rfc: string, anio: string, mes: string, balanza: Balanza): string {
  const lineas: string[] = [];
  lineas.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lineas.push(
    `<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion` +
      ` http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd"` +
      ` Version="1.3" RFC="${escapeXml(rfc)}" Mes="${mes}" Anio="${anio}" TipoEnvio="N">`,
  );
  for (const r of balanza.renglones) {
    lineas.push(
      `  <BCE:Ctas NumCta="${escapeXml(r.cuenta.codigo)}" SaldoIni="${f2(r.saldoInicial)}"` +
        ` Debe="${f2(r.debe)}" Haber="${f2(r.haber)}" SaldoFin="${f2(r.saldoFinal)}"/>`,
    );
  }
  lineas.push(`</BCE:Balanza>`);
  return lineas.join("\n");
}
