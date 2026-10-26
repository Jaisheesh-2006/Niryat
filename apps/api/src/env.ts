import { parseEnv } from "@niryat/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PAYPAL_ENVIRONMENT: z.literal("SANDBOX").default("SANDBOX"),
  PUBLIC_APP_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .url()
      .default("http://localhost:3000")
      .transform((url) => url.replace(/\/+$/, "")),
  ),
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

const paypalSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_WEBHOOK_ID: z.string().min(1),
});

export function loadPayPalEnv(input: Record<string, string | undefined>) {
  return input.PAYPAL_CLIENT_ID ? parseEnv(paypalSchema, input) : undefined;
}

const fileStorageSchema = z.object({
  FILE_STORAGE_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  FILE_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  FILE_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  FILE_STORAGE_REGION: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).default("auto"),
  ),
});

export type FileStorageEnv = z.output<typeof fileStorageSchema>;

export function loadFileStorageEnv(input: Record<string, string | undefined>) {
  return input.FILE_STORAGE_URL ? parseEnv(fileStorageSchema, input) : undefined;
}
