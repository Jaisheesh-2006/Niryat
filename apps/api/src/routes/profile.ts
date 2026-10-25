import { getProfile, upsertProfile } from "@niryat/db";
import { profileInputSchema } from "@niryat/shared";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

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
    const body = await parseJsonBody(c, profileInputSchema);
    if (!body.ok) return body.response;
    return c.json(await upsertProfile(deps.db, userId, body.data, deps.encryptionKey));
  });
  return routes;
}
