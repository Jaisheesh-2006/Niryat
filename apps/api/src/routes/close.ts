import { listAgentRuns, listReminderActions, startAgentRun } from "@niryat/db";
import { agentRunSchema, closePageSchema } from "@niryat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { readSession } from "../auth/session";
import { executeAgentRun } from "../close";
import { indiaDate } from "../rules";
import type { AppDeps } from "./auth";
import { parseJsonBody } from "./body";

const closeRequestSchema = z.strictObject({});

export function closeRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  const runInBackground =
    deps.runInBackground ?? ((work) => void work().catch(() => console.error("close_failed")));
  routes.get("/close", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const [runs, approvals] = await Promise.all([
      listAgentRuns(deps.db, userId, ["monthly_close", "reminders"], 12),
      listReminderActions(deps.db, userId, 50),
    ]);
    return c.json(closePageSchema.parse({ runs, approvals }));
  });
  routes.post("/close", async (c) => {
    const userId = await readSession(c, deps.sessionSecret);
    if (!userId) return c.json({ error: "unauthenticated" }, 401);
    const body = await parseJsonBody(c, closeRequestSchema);
    if (!body.ok) return body.response;
    const now = new Date();
    const asOf = indiaDate(now);
    const input = {
      userId,
      kind: "monthly_close",
      trigger: "manual",
      month: asOf.slice(0, 7),
      asOf,
    } as const;
    const started = await startAgentRun(deps.db, input, now);
    if (!started.ok) return c.json({ error: "close_running" }, 409);
    const run = agentRunSchema.parse({
      ...input,
      id: started.runId,
      status: "running",
      error: null,
      startedAt: now.toISOString(),
      finishedAt: null,
      summary: null,
      toolCalls: [],
    });
    await runInBackground(() => executeAgentRun(deps, { ...input, runId: started.runId }, now));
    return c.json(run, 202);
  });
  return routes;
}
