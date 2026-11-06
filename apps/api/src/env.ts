import { parseEnv } from "@niryat/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RENDER: z.literal("true").optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PAYPAL_ENVIRONMENT: z.literal("SANDBOX").default("SANDBOX"),
  JUDGE_MODE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  ),
  PUBLIC_APP_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .url()
      .default("http://localhost:3000")
      .transform((url) => url.replace(/\/+$/, "")),
  ),
});
export const loadEnv = (input: unknown) => parseEnv(schema, input);

const workflowSchema = z.object({
  RENDER_API_KEY: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().trim().min(1).optional(),
  ),
  RENDER_USE_LOCAL_DEV: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["true", "false"]).optional(),
  ),
});
export function loadWorkflowEnv(input: Record<string, string | undefined>) {
  const env = parseEnv(workflowSchema, input);
  return env.RENDER_API_KEY || env.RENDER_USE_LOCAL_DEV === "true" ? env : undefined;
}

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

const aiSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().min(1),
  AI_MONTHLY_BUDGET_USD: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0),
});

export function loadAiEnv(input: Record<string, string | undefined>) {
  return input.ANTHROPIC_API_KEY ? parseEnv(aiSchema, input) : undefined;
}
