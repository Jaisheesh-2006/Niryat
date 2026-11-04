import { resolve } from "node:path";
import { loadApiUrl, parseEnv } from "@niryat/config";
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

const apiUrl = loadApiUrl(process.env);
const { PUBLIC_APP_URL: publicAppUrl } = parseEnv(
  z.object({
    PUBLIC_APP_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  }),
  process.env,
);

const config: NextConfig = {
  allowedDevOrigins: publicAppUrl ? [new URL(publicAppUrl).hostname] : [],
  transpilePackages: ["@niryat/shared"],
  // Avoid missing SST files in the persistent Windows development cache.
  experimental: { turbopackFileSystemCacheForDev: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};
export default config;
