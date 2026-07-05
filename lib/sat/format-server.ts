// Formato de moneda utilizable en el servidor (lib/client.ts es "use client").
export function mxn(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}
