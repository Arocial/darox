import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  assetPrefix: './',
  serverExternalPackages: ["@copilotkit/runtime"],
};

export default nextConfig;
