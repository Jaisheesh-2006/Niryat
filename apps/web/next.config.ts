import { resolve } from "node:path";
import { parseEnv } from "@niryat/config";
import type { NextConfig } from "next";
import { z } from "zod";

// Next discovers package-local env files; development shares the API's root settings too.
if (process.env.NODE_ENV === "development") {
  try {
    process.loadEnvFile(resolve("../../.env"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

// Same default as src/lib/env.ts; kept here so next.config imports no app modules.
const { API_URL: apiUrl, PUBLIC_APP_URL: publicAppUrl } = parseEnv(
  z.object({
    API_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .url()
        .default("http://localhost:3001")
        .transform((url) => url.replace(/\/+$/, "")),
    ),
    PUBLIC_APP_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  }),
  process.env,
);

const config: NextConfig = {
  allowedDevOrigins: publicAppUrl ? [new URL(publicAppUrl).hostname] : [],
  transpilePackages: ["@niryat/shared"],
  // Avoid missing SST files in the persistent Windows development cache.
  experimental: { turbopackFileSystemCacheForDev: false },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};
export default config;
