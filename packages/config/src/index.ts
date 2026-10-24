import type { z } from "zod";

// Report keys, never rejected values: those values may contain credentials.
export function parseEnv<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const keys = [
      ...new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment")),
    ];
    throw new Error(`Invalid environment: ${keys.join(", ")}. See .env.example.`);
  }
  return result.data;
}
