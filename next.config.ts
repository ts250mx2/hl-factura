import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-forge", "@nodecfdi/sat-ws-descarga-masiva", "mysql2"],
  // Permite aislar el build (p. ej. verificación) del .next que usa `next dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
