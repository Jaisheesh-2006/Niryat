import { parseEnv } from "@niryat/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PAYPAL_ENVIRONMENT: z.literal("SANDBOX").default("SANDBOX"),
});
export const loadEnv = (input: unknown) => parseEnv(schema, input);

const authSchema = z.object({
  DATABASE_URL: z.url(),
  ENCRYPTION_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
});

export function loadAuthEnv(
  input: Record<string, string | undefined>,
): z.output<typeof authSchema> | undefined {
  return input.DATABASE_URL ? parseEnv(authSchema, input) : undefined;
}
