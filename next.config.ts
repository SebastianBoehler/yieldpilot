import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@aave-dao/aave-address-book",
    "@aave/core-v3",
    "@aave/periphery-v3",
  ],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
