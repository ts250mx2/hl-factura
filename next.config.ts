import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-forge", "@nodecfdi/sat-ws-descarga-masiva", "mysql2"],
};

export default nextConfig;
