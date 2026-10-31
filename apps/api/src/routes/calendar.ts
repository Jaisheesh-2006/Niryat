import { getProfile, listInvoices } from "@niryat/db";
import { calendarEventSchema } from "@niryat/shared";
import { Hono } from "hono";
import { readSession } from "../auth/session";
import { buildCalendarEvents } from "../calendar";
import { toInvoiceView } from "../compliance";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

export function calendarRoutes(
  deps: Pick<AppDeps, "db" | "encryptionKey" | "sessionSecret">,
): Hono {
  const routes = new Hono();
  routes.get("/calendar", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const today = todayInIndia();
    const profile = (await getProfile(deps.db, userId, deps.encryptionKey)) ?? null;
    const views = (await listInvoices(deps.db, userId)).map((invoice) =>
      toInvoiceView(invoice, profile?.gstRegistered ?? null, today),
    );
    return c.json(
      calendarEventSchema.array().parse(buildCalendarEvents({ profile, views }, today, rules)),
    );
  });
  return routes;
}
