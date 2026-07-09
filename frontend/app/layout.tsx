import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MODULO USR · Tarja Vehicular CSPCP Chancay",
  description: "Reporte de Estado de Unidades — Puerto de Chancay (CSPCP)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1565d8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
