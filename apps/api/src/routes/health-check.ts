import { getProfile } from "@niryat/db";
import { evaluateHealth } from "@niryat/rules";
import { Hono } from "hono";
import { clientAccessDenied, readClientAccess } from "../auth/client-access";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

export function healthCheckRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/health-check", async (c) => {
    const access = await readClientAccess(c, deps, c.req.query("client"));
    if (!access) return clientAccessDenied(c, deps.sessionSecret);
    const { userId } = access;
    const profile = await getProfile(deps.db, userId, deps.encryptionKey);
    if (!profile) return c.json({ error: "not_found" }, 404);
    return c.json(evaluateHealth(profile, { today: todayInIndia(), rules }));
  });
  return routes;
}
