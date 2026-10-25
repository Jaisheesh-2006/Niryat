import type { NextConfig } from "next";
import { z } from "zod";

// Same default as src/lib/env.ts; kept here so next.config imports no app modules.
const apiUrl = z
  .url()
  .default("http://localhost:3001")
  .parse(process.env.API_URL || undefined)
  .replace(/\/+$/, "");

const config: NextConfig = {
  transpilePackages: ["@niryat/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};
export default config;
