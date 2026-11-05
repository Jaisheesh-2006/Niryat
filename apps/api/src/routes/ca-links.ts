import {
  claimCaRequest,
  createCaLink,
  endCaClientLink,
  endCaLink,
  getCaLink,
  getProfile,
  listCaClients,
  listCaRequests,
  listInvoices,
  listReminderActions,
  respondToCaRequest,
} from "@niryat/db";
import { evaluateHealth } from "@niryat/rules";
import {
  caClaimInputSchema,
  caLinkEndInputSchema,
  caLinkInputSchema,
  caPortfolioSchema,
} from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { readCaSession, readSession } from "../auth/session";
import { buildCalendarEvents } from "../calendar";
import { toInvoiceView } from "../compliance";
import { buildPortfolioRow } from "../dashboard";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

const emptyBodySchema = z.strictObject({});

export function caLinkRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/ca-link", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ link: await getCaLink(deps.db, userId) });
  });
  routes.post("/ca-link", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, caLinkInputSchema);
    if (!body.ok) return body.response;
    const result = await createCaLink(deps.db, userId, body.data.caEmail);
    if (!result.ok)
      return c.json({ error: result.reason }, result.reason === "own_email" ? 400 : 409);
    c.header("Cache-Control", "no-store");
    return c.json({ link: result.link, invitationCode: result.invitationCode }, 201);
  });
  routes.post("/ca-link/end", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, caLinkEndInputSchema);
    if (!body.ok) return body.response;
    return (await endCaLink(deps.db, userId, body.data.linkId, new Date()))
      ? c.body(null, 204)
      : c.json({ error: "not_found" }, 404);
  });
  routes.get("/ca/requests", async (c) => {
    const userId = await readCaSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    return c.json(await listCaRequests(deps.db, userId));
  });
  routes.get("/ca/portfolio", async (c) => {
    const userId = await readCaSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const today = todayInIndia();
    const rows = await Promise.all(
      (await listCaClients(deps.db, userId)).map(async (client) => {
        const id = client.freelancerId;
        const [profile, invoices, reminders] = await Promise.all([
          getProfile(deps.db, id, deps.encryptionKey),
          listInvoices(deps.db, id),
          // shortcut: counts proposed reminders among the latest 50 (as /close does); add a count query if clients exceed that.
          listReminderActions(deps.db, id, 50),
        ]);
        const views = invoices.map((invoice) =>
          toInvoiceView(invoice, profile?.gstRegistered ?? null, today),
        );
        return buildPortfolioRow(client, {
          views,
          health: profile ? evaluateHealth(profile, { today, rules }) : null,
          events: buildCalendarEvents({ profile: profile ?? null, views }, today, rules),
          reminders,
        });
      }),
    );
    rows.sort(
      (a, b) =>
        b.overdueCount - a.overdueCount ||
        (a.nextDeadline?.date ?? "~").localeCompare(b.nextDeadline?.date ?? "~"),
    );
    return c.json(caPortfolioSchema.parse(rows));
  });
  routes.post("/ca/requests/claim", async (c) => {
    const userId = await readCaSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, caClaimInputSchema);
    if (!body.ok) return body.response;
    return (await claimCaRequest(deps.db, userId, body.data.invitationCode))
      ? c.body(null, 204)
      : c.json({ error: "invalid_invitation" }, 404);
  });
  for (const response of ["accept", "decline"] as const) {
    routes.post(`/ca/requests/:id/${response}`, async (c) => {
      const userId = await readCaSession(c, deps.sessionSecret);
      if (!userId) return c.json({ error: "unauthenticated" }, 401);
      const id = z.uuid().safeParse(c.req.param("id"));
      if (!id.success) return c.json({ error: "not_found" }, 404);
      const body = await parseJsonBody(c, emptyBodySchema);
      if (!body.ok) return body.response;
      return (await respondToCaRequest(deps.db, userId, id.data, response, new Date()))
        ? c.body(null, 204)
        : c.json({ error: "not_found" }, 404);
    });
  }
  routes.post("/ca/clients/:freelancerId/end", async (c) => {
    const userId = await readCaSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = z.uuid().safeParse(c.req.param("freelancerId"));
    if (!id.success) return c.json({ error: "not_found" }, 404);
    const body = await parseJsonBody(c, caLinkEndInputSchema);
    if (!body.ok) return body.response;
    return (await endCaClientLink(deps.db, userId, id.data, body.data.linkId, new Date()))
      ? c.body(null, 204)
      : c.json({ error: "not_found" }, 404);
  });
  return routes;
}
