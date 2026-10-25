import { resolve } from "node:path";
import { parseEnv } from "@niryat/config";
import { defineConfig } from "drizzle-kit";
import { z } from "zod";

// drizzle-kit runs from packages/db and does not read the root .env; load it when present.
// Variables already set in the shell take precedence over the file.
try {
  process.loadEnvFile(resolve("../../.env"));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

// Generation is offline; migrations require DATABASE_URL supplied by the developer.
const env = parseEnv(
  z.object({
    DATABASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
  }),
  process.env,
);
if (process.argv.includes("migrate") && !env.DATABASE_URL) {
  throw new Error(
    "Invalid environment: DATABASE_URL is required for migrations. See .env.example.",
  );
}
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(env.DATABASE_URL ? { dbCredentials: { url: env.DATABASE_URL } } : {}),
});
