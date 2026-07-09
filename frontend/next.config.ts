import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker mínima: copia solo lo necesario a .next/standalone
  output: "standalone",
};

export default nextConfig;
