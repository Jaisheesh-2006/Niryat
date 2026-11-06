import { completeTask, listTasks, planTask } from "@niryat/db";
import { taskPlanInputSchema } from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { clientAccessDenied, readClientAccess } from "../auth/client-access";
import { readSession } from "../auth/session";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

export function taskRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  routes.post("/tasks/:id/plan", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const taskId = z.uuid().safeParse(c.req.param("id"));
    if (!taskId.success) return c.json({ error: "not_found" }, 404);
    const body = await parseJsonBody(c, taskPlanInputSchema);
    if (!body.ok) return body.response;
    const task = await planTask(deps.db, userId, taskId.data, body.data);
    return task ? c.json(task) : c.json({ error: "not_found" }, 404);
  });
  routes.get("/tasks", async (c) => {
    const access = await readClientAccess(c, deps, c.req.query("client"));
    if (!access) return clientAccessDenied(c, deps.sessionSecret);
    const { userId } = access;
    return c.json(await listTasks(deps.db, userId));
  });
  routes.post("/tasks/:id/done", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const taskId = z.uuid().safeParse(c.req.param("id"));
    if (!taskId.success) return c.json({ error: "not_found" }, 404);
    const body = await parseJsonBody(c, z.strictObject({}));
    if (!body.ok) return body.response;
    const task = await completeTask(deps.db, userId, taskId.data);
    return task ? c.json(task) : c.json({ error: "not_found" }, 404);
  });
  return routes;
}
