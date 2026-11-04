import { z } from "zod";

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

export function loadApiUrl(input: unknown): string {
  const env = parseEnv(
    z.object({
      API_URL: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.url().default("http://localhost:3001"),
      ),
      API_INTERNAL_HOSTPORT: z
        .string()
        .regex(/^[a-zA-Z0-9.-]+:\d+$/)
        .transform((value) => `http://${value}`)
        .pipe(z.url())
        .optional(),
    }),
    input,
  );
  return (env.API_INTERNAL_HOSTPORT ?? env.API_URL).replace(/\/+$/, "");
}
