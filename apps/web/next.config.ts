import type { NextConfig } from "next";
import { resolve } from "node:path";

const arenaServer = process.env.ARENA_SERVER_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  transpilePackages: ["@arena/contracts"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${arenaServer}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
