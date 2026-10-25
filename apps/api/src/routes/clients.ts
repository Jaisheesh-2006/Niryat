import { createClient, listClients, updateClient } from "@niryat/db";
import { checkExportConditions } from "@niryat/rules";
import { clientInputSchema } from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { readSession } from "../auth/session";
import { rules, todayInIndia } from "../rules";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

export function clientRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.get("/clients", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    return c.json(await listClients(deps.db, userId));
  });
  routes.post("/clients", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, clientInputSchema);
    if (!body.ok) return body.response;
    const { name, country, answers } = body.data;
    const result = checkExportConditions({ country, answers }, { today: todayInIndia(), rules });
    const client = await createClient(deps.db, userId, {
      name,
      country,
      exportCheck: { answers, result },
    });
    return c.json(client, 201);
  });
  routes.put("/clients/:id", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "not_found" }, 404);
    const body = await parseJsonBody(c, clientInputSchema);
    if (!body.ok) return body.response;
    const { name, country, answers } = body.data;
    const result = checkExportConditions({ country, answers }, { today: todayInIndia(), rules });
    const client = await updateClient(deps.db, userId, id.data, {
      name,
      country,
      exportCheck: { answers, result },
    });
    return client ? c.json(client) : c.json({ error: "not_found" }, 404);
  });
  return routes;
}
