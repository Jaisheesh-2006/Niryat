import { readSyncStatus } from "@niryat/db";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import type { AppDeps } from "./auth";

export function syncStatusRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/sync-status", async (c) => {
    if (!(await readSession(c, deps.sessionSecret)))
      return c.json({ error: "unauthenticated" }, 401);
    c.header("Cache-Control", "no-store");
    return c.json(await readSyncStatus(deps.db, new Date()));
  });
  return routes;
}
