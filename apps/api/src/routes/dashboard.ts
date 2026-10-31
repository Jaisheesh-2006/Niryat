import { getProfile, listInvoices } from "@niryat/db";
import { evaluateHealth } from "@niryat/rules";
import { dashboardSchema } from "@niryat/shared";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import { toInvoiceView } from "../compliance";
import { buildDashboard } from "../dashboard";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

export function dashboardRoutes(
  deps: Pick<AppDeps, "db" | "encryptionKey" | "sessionSecret">,
): Hono {
  const routes = new Hono();
  routes.get("/dashboard", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const today = todayInIndia();
    const profile = await getProfile(deps.db, userId, deps.encryptionKey);
    const views = (await listInvoices(deps.db, userId)).map((invoice) =>
      toInvoiceView(invoice, profile?.gstRegistered ?? null, today),
    );
    const health = profile ? evaluateHealth(profile, { today, rules }) : null;
    return c.json(dashboardSchema.parse(buildDashboard({ views, health }, today)));
  });
  return routes;
}
