import { randomBytes, randomUUID } from "node:crypto";
import type { ClaudeRunner } from "@niryat/agent";
import { createDb, finishAgentRun, listAgentRuns, startAgentRun } from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { clientSchema, extractionFieldNames, extractionResultSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as session from "../auth/session";
import * as extraction from "../extraction";
import { createApp } from "../index";
import { indiaDate } from "../rules";
import type { AppDeps } from "./auth";

const text = "Please invoice Acme Inc (BILLING@acme.example) USD 1,500 for dashboard work.";
function draft() {
  return {
    ...Object.fromEntries(
      extractionFieldNames.map((name) => [name, { value: null, source: null }]),
    ),
    clientName: { value: "Acme Inc", source: "Acme Inc" },
    clientEmail: { value: "billing@acme.example", source: "BILLING@acme.example" },
    amount: { value: "1500", source: "1,500" },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("extraction route boundary without services", () => {
  const database = createDb("postgresql://unused@127.0.0.1:1/unused");
  const app = createApp({
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  });
  afterAll(database.close);
  function post(body: unknown = { text }) {
    return app.request("/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  it("requires a session", async () => {
    expect((await post()).status).toBe(401);
  });
  it.each([{ text: "too short" }, { text, extra: true }, { text: "x".repeat(8001) }, null])(
    "rejects invalid input before extraction",
    async (body) => {
      vi.spyOn(session, "readSession").mockResolvedValue(randomUUID());
      const extract = vi.spyOn(extraction, "extractInvoice");
      expect((await post(body)).status).toBe(400);
      expect(extract).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["ai_unavailable", 503],
    ["ai_budget_exhausted", 503],
    ["extraction_running", 409],
    ["extraction_failed", 502],
  ] as const)("maps %s to HTTP %s", async (reason, status) => {
    vi.spyOn(session, "readSession").mockResolvedValue(randomUUID());
    vi.spyOn(extraction, "extractInvoice").mockResolvedValue({ ok: false, reason });
    const response = await post();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reason });
  });
});

describe.skipIf(!testDatabaseUrl)("extraction service and routes with stored runs", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let deps: AppDeps;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let cookie: string;
  const run = vi.fn<ClaudeRunner["run"]>();
  const now = () => new Date();
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    run.mockReset().mockImplementation(async ({ tools }) => {
      const tool = tools[0];
      if (!tool) throw new Error("Missing extraction tool");
      await tool.handler(draft());
      return { status: "used", costUsd: "0.0123" };
    });
    deps = {
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
      ai: { runner: { run }, monthlyBudgetUsd: "5" },
    };
    app = createApp(deps);
    ({ userId, cookie } = await signup("extract-a@example.com"));
  });
  afterAll(async () => {
    await t?.close();
  });
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
  async function saveClient(cookie: string) {
    const response = await app.request("/clients", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Acme Inc",
        country: "US",
        email: "billing@acme.example",
        address: null,
        answers: {
          supplierInIndia: true,
          clientPresentInIndia: false,
          paidInForeignCurrency: true,
          sameEstablishment: false,
        },
      }),
    });
    expect(response.status).toBe(201);
    return clientSchema.parse(await response.json());
  }
  function post(cookie: string) {
    return app.request("/extract", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }
  async function start() {
    const asOf = indiaDate(now());
    const started = await startAgentRun(
      t.db,
      { userId, kind: "extraction", trigger: "manual", month: asOf.slice(0, 7), asOf },
      now(),
    );
    if (!started.ok) throw new Error("Expected run");
    return started.runId;
  }
  it("returns verified fields and the user's existing email match, retaining only names in the log", async () => {
    const client = await saveClient(cookie);
    const response = await post(cookie);
    expect(response.status).toBe(200);
    const result = extractionResultSchema.parse(await response.json());
    expect(result.matchedClientId).toBe(client.id);
    expect(result.fields.amount.value).toBe("1500");
    const runs = await listAgentRuns(t.db, userId, ["extraction"], 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "completed",
      kind: "extraction",
      trigger: "manual",
      summary: null,
      error: null,
    });
    expect(runs[0]?.toolCalls.map((call) => call.tool)).toEqual([
      "submit_extraction",
      "verify_extraction",
    ]);
    expect(JSON.stringify(runs)).not.toContain("acme.example");
    expect(JSON.stringify(runs)).not.toContain(text);
    expect(JSON.stringify(runs)).not.toContain("Acme Inc");
    // Cost is stored separately from the public run view.
    const { aiSpendSince } = await import("@niryat/db");
    expect(Number(await aiSpendSince(t.db, new Date(0)))).toBe(0.0123);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ maxBudgetUsd: 0.1, maxTurns: 3 }));
    const clients = await app.request("/clients", { headers: { Cookie: cookie } });
    expect(z.array(clientSchema).parse(await clients.json())).toEqual([client]);
  });
  it("never matches another user's client", async () => {
    await saveClient(cookie);
    const other = await signup("extract-b@example.com");
    const response = await post(other.cookie);
    expect(response.status).toBe(200);
    expect(extractionResultSchema.parse(await response.json()).matchedClientId).toBeNull();
    expect(await listAgentRuns(t.db, userId, ["extraction"], 10)).toEqual([]);
  });
  it("does not start a run when AI is unavailable", async () => {
    expect(
      await extraction.extractInvoice(
        { db: t.db, encryptionKey: deps.encryptionKey },
        userId,
        text,
        now(),
      ),
    ).toEqual({ ok: false, reason: "ai_unavailable" });
    expect(run).not.toHaveBeenCalled();
    expect(await listAgentRuns(t.db, userId, ["extraction"], 10)).toEqual([]);
  });
  it("enforces deployment-wide spend before starting another run", async () => {
    const runId = await start();
    await finishAgentRun(t.db, runId, {
      status: "completed",
      error: null,
      summary: null,
      aiStatus: "used",
      aiCostUsd: "5",
    });
    const other = await signup("budget-b@example.com");
    expect(await extraction.extractInvoice(deps, other.userId, text, now())).toEqual({
      ok: false,
      reason: "ai_budget_exhausted",
    });
    expect(run).not.toHaveBeenCalled();
    expect(await listAgentRuns(t.db, other.userId, ["extraction"], 10)).toEqual([]);
  });
  it("allows only one active extraction per user", async () => {
    await start();
    expect(await extraction.extractInvoice(deps, userId, text, now())).toEqual({
      ok: false,
      reason: "extraction_running",
    });
    expect(run).not.toHaveBeenCalled();
  });
  it.each(["failed", "budget_exhausted"] as const)(
    "marks a %s runner result failed even after a valid draft",
    async (status) => {
      run.mockImplementationOnce(async ({ tools }) => {
        await tools[0]?.handler(draft());
        return { status, costUsd: "0.0123" };
      });
      expect(await extraction.extractInvoice(deps, userId, text, now())).toEqual({
        ok: false,
        reason: "extraction_failed",
      });
      expect((await listAgentRuns(t.db, userId, ["extraction"], 10))[0]).toMatchObject({
        status: "failed",
        error: "extraction_failed",
      });
    },
  );
  it("rejects a retained draft after a runner error result, preserving reported cost", async () => {
    run.mockImplementationOnce(async (input) => {
      await input.tools[0]?.handler(draft());
      return { status: "failed", costUsd: "0.0123" };
    });
    const response = await post(cookie);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "extraction_failed" });
    const runs = await listAgentRuns(t.db, userId, ["extraction"], 10);
    expect(runs[0]).toMatchObject({ status: "failed", error: "extraction_failed" });
    expect(runs[0]?.toolCalls).toHaveLength(1);
    const { aiSpendSince } = await import("@niryat/db");
    expect(Number(await aiSpendSince(t.db, new Date(0)))).toBe(0.0123);
  });
  it("fails a missing draft or interrupted runner and charges the cap for an interruption", async () => {
    run.mockResolvedValueOnce({ status: "used", costUsd: "0.0100" });
    expect(await extraction.extractInvoice(deps, userId, text, now())).toEqual({
      ok: false,
      reason: "extraction_failed",
    });
    run.mockRejectedValueOnce(new Error("private runner output"));
    expect(await extraction.extractInvoice(deps, userId, text, now())).toEqual({
      ok: false,
      reason: "extraction_failed",
    });
    const { aiSpendSince } = await import("@niryat/db");
    expect(Number(await aiSpendSince(t.db, new Date(0)))).toBe(0.11);
  });
});
