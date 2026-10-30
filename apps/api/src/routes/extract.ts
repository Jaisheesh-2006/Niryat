import { extractionRequestSchema } from "@niryat/shared";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import { extractInvoice } from "../extraction";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

export function extractRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.post("/extract", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, extractionRequestSchema);
    if (!body.ok) return body.response;
    const result = await extractInvoice(deps, userId, body.data.text, new Date());
    if (result.ok) return c.json(result.result);
    const status =
      result.reason === "extraction_running"
        ? 409
        : result.reason === "extraction_failed"
          ? 502
          : 503;
    return c.json({ error: result.reason }, status);
  });
  return routes;
}
