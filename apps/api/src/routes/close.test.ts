import { randomBytes, randomUUID } from "node:crypto";
import * as storage from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { agentRunSchema, closePageSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as session from "../auth/session";
import * as close from "../close";
import { createApp } from "../index";
import type { AppDeps } from "./auth";

afterEach(() => vi.restoreAllMocks());

describe("close route boundaries without services", () => {
  const database = storage.createDb("postgresql://unused@127.0.0.1:1/unused");
  const deps: AppDeps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = createApp(deps);
  afterAll(database.close);

  it.each(["GET", "POST"])("requires a session for %s /close", async (method) => {
    expect((await app.request("/close", { method })).status).toBe(401);
  });

  it.each(['{"asOf":"2027-01-01"}', '{"month":"2026-09"}', "null", "[]", "{"])(
    "rejects invalid input %s before starting a run",
    async (body) => {
      vi.spyOn(session, "readSession").mockResolvedValue(randomUUID());
      const start = vi.spyOn(storage, "startAgentRun");
      const response = await app.request("/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
      expect(start).not.toHaveBeenCalled();
    },
  );

  it("requires JSON", async () => {
    vi.spyOn(session, "readSession").mockResolvedValue(randomUUID());
    expect((await app.request("/close", { method: "POST", body: "{}" })).status).toBe(415);
  });

  it("returns a running manual run using the IST date and queues work without waiting", async () => {
    vi.spyOn(session, "readSession").mockResolvedValue(randomUUID());
    vi.spyOn(storage, "startAgentRun").mockResolvedValue({ ok: true, runId: randomUUID() });
    const execute = vi.spyOn(close, "executeAgentRun").mockResolvedValue();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T19:00:00Z"));
    const runInBackground = vi.fn<NonNullable<AppDeps["runInBackground"]>>();
    try {
      const response = await createApp({ ...deps, runInBackground }).request("/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(202);
      expect(agentRunSchema.parse(await response.json())).toMatchObject({
        kind: "monthly_close",
        trigger: "manual",
        month: "2026-11",
        asOf: "2026-11-01",
        status: "running",
        summary: null,
        toolCalls: [],
      });
      expect(execute).not.toHaveBeenCalled();
      const work = runInBackground.mock.calls[0]?.[0];
      if (!work) throw new Error("Expected background work");
      await work();
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ db: deps.db }),
        expect.objectContaining({ month: "2026-11", asOf: "2026-11-01" }),
        new Date("2026-10-31T19:00:00Z"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs only an error key when default background work fails", async () => {
    vi.spyOn(session, "readSession").mockResolvedValue(randomUUID());
    vi.spyOn(storage, "startAgentRun").mockResolvedValue({ ok: true, runId: randomUUID() });
    vi.spyOn(close, "executeAgentRun").mockRejectedValue(new Error("private model output"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await app.request("/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(202);
    expect(log.mock.calls).toEqual([["close_failed"]]);
  });
});

describe.skipIf(!testDatabaseUrl)("close routes with stored runs", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let deps: AppDeps;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let cookie: string;
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    deps = {
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
      runInBackground: async (work) => work(),
    };
    app = createApp(deps);
    ({ userId, cookie } = await signup("close-a@example.test"));
  });
  afterAll(async () => t?.close());

  async function signup(email: string) {
    const response = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery" }),
    });
    expect(response.status).toBe(201);
    const user = z.object({ id: z.uuid() }).parse(await response.json());
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected session cookie");
    return { userId: user.id, cookie };
  }
  function post() {
    return app.request("/close", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    });
  }
  async function page(sessionCookie = cookie) {
    const response = await app.request("/close", { headers: { Cookie: sessionCookie } });
    expect(response.status).toBe(200);
    return closePageSchema.parse(await response.json());
  }

  it("completes without PayPal or AI and exposes the summary and ordered tool calls", async () => {
    const response = await post();
    expect(response.status).toBe(202);
    const started = agentRunSchema.parse(await response.json());
    expect(started.status).toBe("running");
    const result = await page();
    expect(result.approvals).toEqual([]);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      id: started.id,
      status: "completed",
      summary: {
        ai: { status: "unavailable" },
        sync: { payments: "skipped", disputes: "skipped" },
      },
    });
    expect(result.runs[0]?.toolCalls.map((call) => call.tool)).toEqual([
      "sync_payments",
      "sync_disputes",
      "load_invoices",
      "ensure_deadline_tasks",
      "month_ledger",
      "ensure_fira_task",
      "reminder_candidates",
      "claude",
      "propose_reminders",
      "save_suggested_tasks",
    ]);
  });

  it("claims a run before queuing work and refuses a second POST", async () => {
    const runInBackground = vi.fn<NonNullable<AppDeps["runInBackground"]>>();
    app = createApp({ ...deps, runInBackground });
    expect((await post()).status).toBe(202);
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "close_running" });
    expect(runInBackground).toHaveBeenCalledTimes(1);
    expect((await page()).runs[0]?.status).toBe("running");
  });

  it("returns only the latest twelve close/reminder runs and fifty reminder actions for the user", async () => {
    const [client] = await t.db
      .insert(storage.clients)
      .values({ userId, name: "Client", country: "US" })
      .returning();
    if (!client) throw new Error("Expected client");
    const [invoice] = await t.db
      .insert(storage.invoices)
      .values({
        userId,
        clientId: client.id,
        type: "one_time",
        number: "2026-27/0001",
        fy: "2026-27",
        seq: 1,
        date: "2026-10-01",
        currency: "USD",
        amount: "100.00",
        description: "Work",
        sac: "998314",
        status: "sent",
      })
      .returning();
    if (!invoice) throw new Error("Expected invoice");
    const time = (index: number) => new Date(Date.UTC(2026, 9, 1, 0, index));
    const runs = await t.db
      .insert(storage.agentRuns)
      .values(
        Array.from({ length: 13 }, (_, index) => ({
          userId,
          kind: index % 2 === 0 ? "monthly_close" : "reminders",
          trigger: "scheduled",
          month: "2026-09",
          asOf: "2026-10-01",
          status: "completed",
          startedAt: time(index),
          finishedAt: time(index),
        })),
      )
      .returning();
    await t.db.insert(storage.agentRuns).values({
      userId,
      kind: "extraction",
      trigger: "manual",
      month: "2026-10",
      asOf: "2026-10-01",
      status: "completed",
    });
    const actions = await t.db
      .insert(storage.agentActions)
      .values(
        Array.from({ length: 51 }, (_, index) => ({
          userId,
          invoiceId: invoice.id,
          paypalAction: "send_invoice_reminder",
          status: "proposed",
          payload: {},
          createdAt: time(index),
        })),
      )
      .returning();
    await t.db.insert(storage.agentActions).values({
      userId,
      invoiceId: invoice.id,
      paypalAction: "send_invoice",
      status: "proposed",
      payload: {},
    });
    const result = await page();
    expect(result.runs.map((run) => run.id)).toEqual(
      runs
        .slice(1)
        .reverse()
        .map((run) => run.id),
    );
    expect(result.approvals.map((action) => action.id)).toEqual(
      actions
        .slice(1)
        .reverse()
        .map((action) => action.id),
    );
    expect(result.approvals[0]).toMatchObject({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
    });
    const other = await signup("close-b@example.test");
    expect(await page(other.cookie)).toEqual({ runs: [], approvals: [] });
  });
});
