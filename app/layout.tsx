import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "HL Factura · Portal de Facturación CFDI 4.0",
  description:
    "Portal de facturación electrónica para México: emisión CFDI 4.0, certificados CSD/FIEL, timbrado, cancelación y descarga masiva del SAT. Multi-despacho con roles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
