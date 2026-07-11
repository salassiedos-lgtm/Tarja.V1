import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MODULO USR · Tarja Vehicular CSPCP Chancay",
  description: "Reporte de Estado de Unidades — Puerto de Chancay (CSPCP)",
  applicationName: "Tarja",
  manifest: "/manifest.webmanifest",
  // Permite que iOS la abra a pantalla completa al "Agregar a inicio".
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Tarja" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
