import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3010";

const nextConfig: NextConfig = {
  // Imagen Docker mínima: copia solo lo necesario a .next/standalone
  output: "standalone",
  // Permite que el HMR de dev conteste a un tunel de ngrok, cuyo subdominio
  // cambia cada vez que se reinicia (plan free, sin dominio reservado).
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  async rewrites() {
    // Reenvia /api/* al backend local. Asi el frontend y el backend quedan
    // en el mismo origen para el navegador (sin CORS, sin IP que cambie
    // cada vez que se prueba desde otra red o por un tunel de ngrok).
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;
