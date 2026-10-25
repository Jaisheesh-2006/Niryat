import type { Context } from "hono";
import type { z } from "zod";

export async function parseJsonBody<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return { ok: false, response: c.json({ error: "unsupported_media_type" }, 415) };
  }
  const body = await c.req.json<unknown>().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    return { ok: false, response: c.json({ error: "invalid_request", fields }, 400) };
  }
  return { ok: true, data: parsed.data };
}
