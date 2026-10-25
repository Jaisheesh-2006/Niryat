import { getProfile } from "@niryat/db";
import { evaluateHealth } from "@niryat/rules";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

export function healthCheckRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/health-check", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const profile = await getProfile(deps.db, userId, deps.encryptionKey);
    if (!profile) return c.json({ error: "not_found" }, 404);
    return c.json(evaluateHealth(profile, { today: todayInIndia(), rules }));
  });
  return routes;
}
