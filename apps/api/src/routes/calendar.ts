import { getProfile, listCaClients, listInvoices } from "@niryat/db";
import { caCalendarSchema, calendarEventSchema } from "@niryat/shared";
import { Hono } from "hono";
import { clientAccessDenied, readClientAccess } from "../auth/client-access";
import { readCaSession } from "../auth/session";
import { buildCalendarEvents } from "../calendar";
import { toInvoiceView } from "../compliance";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";

export function calendarRoutes(
  deps: Pick<AppDeps, "db" | "encryptionKey" | "sessionSecret">,
): Hono {
  const routes = new Hono();
  routes.get("/calendar", async (c) => {
    const access = await readClientAccess(c, deps, c.req.query("client"));
    if (!access) return clientAccessDenied(c, deps.sessionSecret);
    const { userId } = access;
    const today = todayInIndia();
    const profile = (await getProfile(deps.db, userId, deps.encryptionKey)) ?? null;
    const views = (await listInvoices(deps.db, userId)).map((invoice) =>
      toInvoiceView(invoice, profile?.gstRegistered ?? null, today),
    );
    return c.json(
      calendarEventSchema.array().parse(buildCalendarEvents({ profile, views }, today, rules)),
    );
  });
  routes.get("/ca/calendar", async (c) => {
    const caId = await readCaSession(c, deps.sessionSecret);
    if (!caId) return c.json({ error: "unauthenticated" }, 401);
    const clients = (await listCaClients(deps.db, caId)).map((client) => ({
      id: client.freelancerId,
      name: client.name ?? "Unnamed freelancer",
    }));
    const today = todayInIndia();
    const events = await Promise.all(
      clients.map(async (client) => {
        const [profile, invoices] = await Promise.all([
          getProfile(deps.db, client.id, deps.encryptionKey),
          listInvoices(deps.db, client.id),
        ]);
        const views = invoices.map((invoice) =>
          toInvoiceView(invoice, profile?.gstRegistered ?? null, today),
        );
        return buildCalendarEvents({ profile: profile ?? null, views }, today, rules).map(
          (event) => ({
            ...event,
            freelancerId: client.id,
            id: `${client.id}:${event.id}`,
            href: `/ca/clients/${client.id}`,
          }),
        );
      }),
    );
    return c.json(caCalendarSchema.parse({ clients, events: events.flat() }));
  });
  return routes;
}
