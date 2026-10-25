import { getProfile, upsertProfile } from "@niryat/db";
import { profileInputSchema } from "@niryat/shared";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import type { AppDeps } from "./auth";

export function profileRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/profile", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const profile = await getProfile(deps.db, userId, deps.encryptionKey);
    return profile ? c.json(profile) : c.json({ error: "not_found" }, 404);
  });
  routes.put("/profile", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    const body = await c.req.json<unknown>().catch(() => undefined);
    const parsed = profileInputSchema.safeParse(body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
      return c.json({ error: "invalid_request", fields }, 400);
    }
    return c.json(await upsertProfile(deps.db, userId, parsed.data, deps.encryptionKey));
  });
  return routes;
}
