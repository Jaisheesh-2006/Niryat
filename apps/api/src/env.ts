import { parseEnv } from "@niryat/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PAYPAL_ENVIRONMENT: z.literal("SANDBOX").default("SANDBOX"),
});
export const loadEnv = (input: unknown) => parseEnv(schema, input);
