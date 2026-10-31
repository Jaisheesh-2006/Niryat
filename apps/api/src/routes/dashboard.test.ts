import { randomBytes, randomUUID } from "node:crypto";
import { createDashboardLlm } from "@niryat/agent";
import * as db from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import {
  DASHBOARD_FIGURE_NOTE,
  dashboardSchema,
  dashboardTurnResponseSchema,
  profileInputSchema,
} from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";
import * as clock from "../rules";
import type { AppDeps } from "./auth";

const API_KEY = "sk-test-dashboard-key";
const message = (text: string) => ({
  id: randomUUID(),
  kind: "input",
  type: "message",
  role: "user",
  content: [{ type: "text", text }],
  status: "completed",
});
const turn = {
  input: [message("Show my PayPal fees by client this year")],
  instructions: "AG instructions",
  tools: [
    {
      name: "add_widget",
      description: "Add a widget",
      parameters: { type: "object", properties: { title: { type: "string" } } },
    },
  ],
  responseFormat: { type: "text" },
};
const providerReply = {
  id: "msg_turn",
  model: "fake-model",
  content: [
    { type: "text", text: "Fees were USD 4.40 in October." },
    {
      type: "tool_use",
      id: "toolu_1",
      name: "add_widget",
      input: { title: "Fees by client", secretValue: "Client 0 USD 4.40" },
    },
  ],
  stop_reason: "tool_use",
  usage: { input_tokens: 100, output_tokens: 20 },
};
function aiDeps(fetcher: typeof fetch, monthlyBudgetUsd = "5"): NonNullable<AppDeps["ai"]> {
  return {
    runner: {
      run: async () => {
        throw new Error("runner_unused");
      },
    },
    dashboard: createDashboardLlm({ apiKey: API_KEY, model: "fake-model" }, fetcher),
    monthlyBudgetUsd,
  };
}
const replyWith = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

const profile = profileInputSchema.parse({
  legalName: "Synthetic seller",
  address: "Synthetic address",
  gstRegistered: true,
  gstin: null,
  lutNumber: "LUT",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
});

describe("dashboard route with fake reads", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = createApp(deps);
  const userId = randomUUID();
  let cookie: string;
  beforeAll(async () => {
    cookie = await cookieFor(userId, deps.sessionSecret);
  });
  beforeEach(() => {
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-10-31");
    vi.spyOn(db, "getProfile").mockResolvedValue(undefined);
    vi.spyOn(db, "listInvoices").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  it("requires a session before reading any records", async () => {
    const response = await app.request("/dashboard");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(db.getProfile).not.toHaveBeenCalled();
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it("returns empty sources and no health without a profile or invoices", async () => {
    const response = await app.request("/dashboard", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(dashboardSchema.parse(await response.json())).toEqual({
      asOf: "2026-10-31",
      health: null,
      payments: [],
      invoices: [],
      disputes: [],
    });
    expect(db.getProfile).toHaveBeenCalledWith(deps.db, userId, deps.encryptionKey);
    expect(db.listInvoices).toHaveBeenCalledWith(deps.db, userId);
  });
});

describe("dashboard turn route with fake persistence", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const base = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const userId = randomUUID();
  let cookie: string;
  beforeAll(async () => {
    cookie = await cookieFor(userId, base.sessionSecret);
  });
  beforeEach(() => {
    vi.spyOn(db, "aiSpendSince").mockResolvedValue("0");
    vi.spyOn(db, "startAgentRun").mockResolvedValue({ ok: true, runId: randomUUID() });
    vi.spyOn(db, "logToolCall").mockResolvedValue();
    vi.spyOn(db, "finishAgentRun").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());
  function post(ai: AppDeps["ai"], body: unknown = turn, headers: Record<string, string> = {}) {
    return createApp({ ...base, ...(ai ? { ai } : {}) }).request("/dashboard/turn", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("requires a session", async () => {
    const fetcher = replyWith(providerReply);
    expect((await post(aiDeps(fetcher), turn, { Cookie: "" })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns 503 without AI and starts no run", async () => {
    const response = await post(undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ai_unavailable" });
    expect(db.startAgentRun).not.toHaveBeenCalled();
  });

  it("rejects a body over 256 KB with 413", async () => {
    const fetcher = replyWith(providerReply);
    const response = await post(aiDeps(fetcher), {
      ...turn,
      input: [message("x".repeat(256 * 1024))],
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  const tool = turn.tools[0];
  const call = {
    id: "c1",
    kind: "output",
    type: "function_call",
    callId: "toolu_0",
    name: "add_widget",
    arguments: "{}",
  };
  it.each([
    ["201 input items", { ...turn, input: Array.from({ length: 201 }, () => message("hi")) }],
    [
      "65 tools",
      { ...turn, tools: Array.from({ length: 65 }, (_, i) => ({ ...tool, name: `t${i}` })) },
    ],
    ["duplicate tool names", { ...turn, tools: [tool, tool] }],
    ["an invalid tool name", { ...turn, tools: [{ ...tool, name: "add.widget" }] }],
    ["a server tool", { ...turn, tools: [{ ...tool, kind: "server" }] }],
    [
      "a JSON response format",
      { ...turn, responseFormat: { type: "json", name: "x", schema: {} } },
    ],
    ["an unknown named tool choice", { ...turn, toolChoice: { name: "missing" } }],
    [
      "an image part",
      { ...turn, input: [{ ...message("hi"), content: [{ type: "image", url: "data:" }] }] },
    ],
    ["non-object arguments", { ...turn, input: [message("hi"), { ...call, arguments: "[1]" }] }],
    [
      "a result without its call",
      {
        ...turn,
        input: [
          message("hi"),
          { type: "function_call_output", callId: "toolu_x", output: "{}", status: "completed" },
        ],
      },
    ],
    [
      "two results for one call",
      {
        ...turn,
        input: [
          message("hi"),
          call,
          { type: "function_call_output", callId: "toolu_0", output: "a", status: "completed" },
          { type: "function_call_output", callId: "toolu_0", output: "b", status: "completed" },
        ],
      },
    ],
    ["an extra field", { ...turn, stream: true }],
  ])("rejects %s with 400 before any call", async (_label, body) => {
    const fetcher = replyWith(providerReply);
    const response = await post(aiDeps(fetcher), body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.startAgentRun).not.toHaveBeenCalled();
  });

  it("returns 402 when the remaining budget is below the flat charge, with zero fetches", async () => {
    vi.mocked(db.aiSpendSince).mockResolvedValue("4.96");
    const fetcher = replyWith(providerReply);
    const response = await post(aiDeps(fetcher, "5"));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "ai_budget_exhausted" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.startAgentRun).not.toHaveBeenCalled();
  });

  it("returns 409 while another turn is running, with zero fetches", async () => {
    vi.mocked(db.startAgentRun).mockResolvedValue({ ok: false, reason: "running" });
    const fetcher = replyWith(providerReply);
    const response = await post(aiDeps(fetcher));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "dashboard_busy" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an Anthropic 500 with its code",
      replyWith({ error: { message: `provider said ${API_KEY}` } }, 500),
      "dashboard_llm_http_500",
    ],
    [
      "a transport error without its text",
      vi.fn<typeof fetch>(async () => {
        throw new Error(`fetch failed ${API_KEY}`);
      }),
      "ai_failed",
    ],
  ])("maps %s to 502, fails the run and still charges", async (_label, fetcher, error) => {
    const response = await post(aiDeps(fetcher));
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "ai_failed" });
    expect(text).not.toContain(API_KEY);
    expect(db.finishAgentRun).toHaveBeenCalledWith(base.db, expect.any(String), {
      status: "failed",
      error,
      summary: null,
      aiStatus: "failed",
      aiCostUsd: "0.05",
    });
    expect(vi.mocked(db.logToolCall).mock.calls).toEqual([
      [
        base.db,
        expect.any(String),
        {
          actor: "system",
          tool: "claude",
          input: {},
          output: { status: "failed", costUsd: "0.05", error },
          ok: false,
        },
      ],
    ]);
  });

  it("returns AG items, logs tool names only and keeps the key out of responses and logs", async () => {
    vi.spyOn(clock, "indiaDate").mockReturnValue("2026-11-01");
    const fetcher = replyWith(providerReply);
    const response = await post(aiDeps(fetcher));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(API_KEY);
    const body = dashboardTurnResponseSchema.parse(JSON.parse(text));
    expect(body.status).toBe("completed");
    expect(body.output).toMatchObject([
      { type: "message", content: [{ text: DASHBOARD_FIGURE_NOTE }] },
      {
        type: "function_call",
        callId: "toolu_1",
        name: "add_widget",
        arguments: JSON.stringify(providerReply.content[1]?.input),
      },
    ]);
    const sent = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(sent.model).toBe("fake-model");
    expect(sent.max_tokens).toBe(2048);
    expect(sent.system).toMatch(
      /^You build AG Studio widgets[\s\S]*2026-27[\s\S]*AG instructions$/,
    );
    expect(db.startAgentRun).toHaveBeenCalledWith(
      base.db,
      { userId, kind: "dashboard", trigger: "manual", month: "2026-11", asOf: "2026-11-01" },
      expect.any(Date),
    );
    const logs = vi.mocked(db.logToolCall).mock.calls.map(([, , call]) => call);
    expect(logs).toEqual([
      {
        actor: "system",
        tool: "claude",
        input: {},
        output: { status: "used", costUsd: "0.05" },
        ok: true,
      },
      {
        actor: "agent",
        tool: "add_widget",
        input: { argumentKeys: ["title", "secretValue"] },
        output: {},
        ok: true,
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/Fees|Client 0|4\.40|sk-test/);
    expect(db.finishAgentRun).toHaveBeenCalledWith(
      base.db,
      expect.any(String),
      expect.objectContaining({ status: "completed", aiStatus: "used", aiCostUsd: "0.05" }),
    );
  });
});

describe.skipIf(!testDatabaseUrl)("dashboard turn route with stored runs", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const secret = "x".repeat(32);
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("records each turn as a charged dashboard run and blocks a concurrent turn", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(async () => {
      await gate;
      return new Response(JSON.stringify(providerReply), { status: 200 });
    });
    const app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: secret,
      secureCookies: false,
      ai: aiDeps(fetcher, "1"),
    });
    const user = await db.createUser(t.db, { email: "turn@example.test", passwordHash: "unused" });
    if (!user) throw new Error("Expected user");
    const send = async () =>
      app.request("/dashboard/turn", {
        method: "POST",
        headers: {
          Cookie: await cookieFor(user.id, secret),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(turn),
      });
    const first = send();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const second = await send();
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    const runs = await db.listAgentRuns(t.db, user.id, ["dashboard"], 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: "dashboard", trigger: "manual", status: "completed" });
    expect(runs[0]?.toolCalls.map(({ actor, tool, input }) => ({ actor, tool, input }))).toEqual([
      { actor: "system", tool: "claude", input: {} },
      { actor: "agent", tool: "add_widget", input: { argumentKeys: ["title", "secretValue"] } },
    ]);
    expect(JSON.stringify(runs)).not.toMatch(/Fees|Client 0|sk-test/);
    expect(await db.aiSpendSince(t.db, new Date(0))).toBe("0.05");
  });
});

describe.skipIf(!testDatabaseUrl)("dashboard route with a stored ledger", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const key = randomBytes(32);
  const secret = "x".repeat(32);
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-10-31");
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await t?.close();
  });

  it("returns only each signed-in user's ledger, without emails or addresses", async () => {
    const app = createApp({
      db: t.db,
      encryptionKey: key,
      sessionSecret: secret,
      secureCookies: false,
    });
    const users = [
      await db.createUser(t.db, { email: "dashboard-a@example.test", passwordHash: "unused" }),
      await db.createUser(t.db, { email: "dashboard-b@example.test", passwordHash: "unused" }),
    ];
    const [a, b] = users;
    if (!a || !b) throw new Error("Expected users");
    await db.upsertProfile(t.db, a.id, profile, key);
    const invoiceIds = [randomUUID(), randomUUID()];
    for (const [index, user] of [a, b].entries()) {
      const clientId = randomUUID();
      await t.db.insert(db.clients).values({
        id: clientId,
        userId: user.id,
        name: `Client ${index}`,
        country: "US",
        email: `buyer-${index}@example.test`,
        address: "Synthetic buyer address",
      });
      const invoiceId = invoiceIds[index];
      if (!invoiceId) throw new Error("Expected invoice ID");
      await t.db.insert(db.invoices).values({
        id: invoiceId,
        userId: user.id,
        clientId,
        type: "one_time",
        number: `2026-27/000${index + 1}`,
        fy: "2026-27",
        seq: index + 1,
        date: "2026-09-30",
        currency: "USD",
        amount: "100.00",
        description: "Software",
        sac: "998314",
        status: "partially_refunded",
      });
      await t.db.insert(db.payments).values([
        {
          invoiceId,
          paypalTxnId: `CAPTURE-${index}`,
          kind: "payment",
          gross: "100.00",
          fee: "4.40",
          net: "95.60",
          currency: "USD",
          fxRate: "84.10",
          receivedAt: new Date("2026-09-30T20:00:00Z"),
        },
        {
          invoiceId,
          paypalTxnId: `REFUND-${index}`,
          kind: "refund",
          gross: "10.00",
          currency: "USD",
          receivedAt: new Date("2026-10-02T00:00:00Z"),
        },
      ]);
      await t.db.insert(db.disputes).values({
        invoiceId,
        paypalDisputeId: `DISPUTE-${index}`,
        amount: "10.00",
        currency: "USD",
        reason: "OTHER",
        status: "OPEN",
        responseDueDate: "2026-11-05",
        paypalUpdatedAt: new Date("2026-10-30T00:00:00Z"),
      });
    }
    for (const [index, user] of [a, b].entries()) {
      const response = await app.request("/dashboard", {
        headers: { Cookie: await cookieFor(user.id, secret) },
      });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(JSON.stringify(body)).not.toMatch(/email|address|example\.test/i);
      const dashboard = dashboardSchema.parse(body);
      expect(dashboard.health === null).toBe(index === 1);
      expect(dashboard.invoices.map((row) => row.invoiceId)).toEqual([invoiceIds[index]]);
      expect(dashboard.invoices[0]?.clientName).toBe(`Client ${index}`);
      expect(
        dashboard.payments
          .map(({ kind, month, financialYear, signedGross }) => ({
            kind,
            month,
            financialYear,
            signedGross,
          }))
          .sort((x, y) => x.kind.localeCompare(y.kind)),
      ).toEqual([
        { kind: "payment", month: "2026-10", financialYear: "2026-27", signedGross: "100.00" },
        { kind: "refund", month: "2026-10", financialYear: "2026-27", signedGross: "-10.00" },
      ]);
      expect(dashboard.disputes.map((row) => row.paypalDisputeId)).toEqual([`DISPUTE-${index}`]);
    }
  });
});
