// Redondeo y formato de importes conforme al Anexo 20 (2 decimales para MXN,
// tasas a 6 decimales, cantidades hasta 6 decimales).

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmtImporte(n: number): string {
  return round2(n).toFixed(2);
}

export function fmtTasa(n: number): string {
  return n.toFixed(6);
}

export function fmtCantidad(n: number): string {
  const s = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

export function fmtTipoCambio(n: number): string {
  const s = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s.includes(".") ? s : s + ".0";
}

/** Fecha local en formato del SAT: AAAA-MM-DDTHH:MM:SS (sin zona horaria). */
export function fechaCfdi(d?: Date): string {
  // Se resta un minuto para evitar rechazos por desfase de reloj contra el PAC/SAT
  const date = d ?? new Date(Date.now() - 60_000);
  const p = (x: number, l = 2) => String(x).padStart(l, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(
    date.getHours(),
  )}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export function moneyMx(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
