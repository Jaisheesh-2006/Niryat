import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listReminderActions, proposeReminder, rejectAction, reminderKeys } from "./actions";
import {
  aiSpendSince,
  finishAgentRun,
  listAgentRuns,
  logToolCall,
  monthLedger,
  startAgentRun,
} from "./agent-runs";
import {
  agentActions,
  agentRuns,
  agentToolCalls,
  clients,
  disputes,
  firaDocuments,
  firaLines,
  invoices,
  matches,
  payments,
} from "./schema";
import { openTestDb, testDatabaseUrl } from "./testing";
import { createUser, listUserIds } from "./users";

describe.skipIf(!testDatabaseUrl)("agent-run storage", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const now = new Date("2026-10-30T12:00:00Z");
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function user() {
    const row = await createUser(t.db, { email: `${randomUUID()}@example.invalid` });
    if (!row) throw new Error("Expected test user");
    return row.id;
  }
  function run(userId: string) {
    return {
      userId,
      kind: "monthly_close",
      trigger: "manual",
      month: "2026-10",
      asOf: "2026-10-30",
    } as const;
  }
  async function start(userId: string) {
    const result = await startAgentRun(t.db, run(userId), now);
    if (!result.ok) throw new Error("Expected test run");
    return result.runId;
  }
  async function invoice(userId: string) {
    const clientId = randomUUID();
    const id = randomUUID();
    await t.db.insert(clients).values({ id: clientId, userId, name: "Synthetic", country: "US" });
    await t.db.insert(invoices).values({
      id,
      userId,
      clientId,
      type: "one_time",
      number: "2026-27/0001",
      fy: "2026-27",
      seq: 1,
      date: "2026-10-01",
      currency: "USD",
      amount: "100.00",
      description: "Synthetic",
      sac: "998314",
      status: "sent",
    });
    return id;
  }

  it("locks per user and kind and replaces only stale runs", async () => {
    const a = await user();
    const b = await user();
    const original = await start(a);
    expect(await startAgentRun(t.db, run(a), now)).toEqual({ ok: false, reason: "running" });
    expect(await startAgentRun(t.db, { ...run(a), kind: "reminders" }, now)).toMatchObject({
      ok: true,
    });
    expect(await startAgentRun(t.db, run(b), now)).toMatchObject({ ok: true });
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(await startAgentRun(t.db, run(a), later)).toMatchObject({ ok: true });
    const [old] = await t.db.select().from(agentRuns).where(eq(agentRuns.id, original));
    expect(old).toMatchObject({ status: "failed", error: "stale", finishedAt: later });
    expect(await listAgentRuns(t.db, a, ["reminders"], 10)).toMatchObject([{ status: "running" }]);
    expect(await listAgentRuns(t.db, b, ["monthly_close"], 10)).toMatchObject([
      { status: "running" },
    ]);
  });

  it("allows only one concurrent start", async () => {
    const a = await user();
    const results = await Promise.all([
      startAgentRun(t.db, run(a), now),
      startAgentRun(t.db, run(a), now),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, reason: "running" });
  });

  it("logs tool calls in sequence and scopes runs to the user and kind", async () => {
    const a = await user();
    const b = await user();
    const runId = await start(a);
    for (const tool of ["first", "second", "third"]) {
      await logToolCall(t.db, runId, {
        actor: "system",
        tool,
        input: {},
        output: { step: tool },
        ok: true,
      });
    }
    const rows = await listAgentRuns(t.db, a, ["monthly_close"], 10);
    expect(rows[0]?.toolCalls.map(({ seq, tool }) => ({ seq, tool }))).toEqual([
      { seq: 1, tool: "first" },
      { seq: 2, tool: "second" },
      { seq: 3, tool: "third" },
    ]);
    expect(await listAgentRuns(t.db, b, ["monthly_close"], 10)).toEqual([]);
    expect(await listAgentRuns(t.db, a, ["extraction"], 10)).toEqual([]);
    expect(await listAgentRuns(t.db, a, [], 10)).toEqual([]);
    expect(await listAgentRuns(t.db, a, ["monthly_close"], 0)).toEqual([]);
    const later = new Date(now.getTime() + 16 * 60_000);
    const latest = await startAgentRun(t.db, run(a), later);
    if (!latest.ok) throw new Error("Expected later run");
    expect((await listAgentRuns(t.db, a, ["monthly_close"], 1)).map(({ id }) => id)).toEqual([
      latest.runId,
    ]);
  });

  it("keeps every concurrent tool call with a distinct consecutive sequence", async () => {
    const a = await user();
    const runId = await start(a);
    const tools = Array.from({ length: 20 }, (_, index) => `read_${index}`);
    const results = await Promise.allSettled(
      tools.map((tool) =>
        logToolCall(t.db, runId, { actor: "agent", tool, input: {}, output: {}, ok: true }),
      ),
    );
    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    const [run] = await listAgentRuns(t.db, a, ["monthly_close"], 1);
    expect(run?.toolCalls.map(({ seq }) => seq)).toEqual(tools.map((_, index) => index + 1));
    expect(run?.toolCalls.map(({ tool }) => tool).sort()).toEqual(tools.sort());
  });

  it("finishes only running rows and sums deployment-wide AI spend since a date", async () => {
    expect(await aiSpendSince(t.db, now)).toBe("0");
    const a = await user();
    const b = await user();
    const first = await start(a);
    const second = await start(b);
    await finishAgentRun(t.db, first, {
      status: "completed",
      error: null,
      summary: null,
      aiStatus: "used",
      aiCostUsd: "0.125",
    });
    const before = await t.db.select().from(agentRuns).where(eq(agentRuns.id, first));
    await finishAgentRun(t.db, first, {
      status: "failed",
      error: "changed",
      summary: null,
      aiStatus: "failed",
      aiCostUsd: "9",
    });
    expect(await t.db.select().from(agentRuns).where(eq(agentRuns.id, first))).toEqual(before);
    await finishAgentRun(t.db, second, {
      status: "failed",
      error: "close_failed",
      summary: null,
      aiStatus: "failed",
      aiCostUsd: "0.25",
    });
    expect(await aiSpendSince(t.db, now)).toBe("0.375");
    expect(await aiSpendSince(t.db, new Date(now.getTime() + 1))).toBe("0");
    expect((await listUserIds(t.db)).sort()).toEqual([a, b].sort());
  });

  it("rejects invalid stored summary and tool JSON without leaking it", async () => {
    const a = await user();
    const runId = await start(a);
    await t.db
      .update(agentRuns)
      .set({ summary: { month: "2026-13", secret: "private" } })
      .where(eq(agentRuns.id, runId));
    await expect(listAgentRuns(t.db, a, ["monthly_close"], 10)).rejects.toThrow(
      "Stored agent run is invalid",
    );
    await t.db.update(agentRuns).set({ summary: null }).where(eq(agentRuns.id, runId));
    await t.db
      .insert(agentToolCalls)
      .values({ runId, seq: 1, actor: "model", tool: "private", input: {}, output: {}, ok: true });
    await expect(listAgentRuns(t.db, a, ["monthly_close"], 10)).rejects.toThrow(
      "Stored agent run is invalid",
    );
  });

  it("deduplicates immutable reminders, keeps rejected keys, and prevents cross-user proposals", async () => {
    const a = await user();
    const b = await user();
    const invoiceId = await invoice(a);
    const input = {
      invoiceId,
      dedupeKey: `reminder:${invoiceId}:60`,
      payload: { stage: 60, agent: null },
    };
    expect(await proposeReminder(t.db, b, input)).toEqual({ ok: false, reason: "not_found" });
    const result = await proposeReminder(t.db, a, input);
    if (!result.ok) throw new Error("Expected reminder");
    expect(await proposeReminder(t.db, a, { ...input, payload: { stage: 30 } })).toEqual({
      ok: false,
      reason: "exists",
    });
    expect(await rejectAction(t.db, a, result.actionId)).toBe(true);
    expect(await reminderKeys(t.db, a)).toEqual(new Set([input.dedupeKey]));
    expect(await reminderKeys(t.db, b)).toEqual(new Set());
    expect(await proposeReminder(t.db, a, input)).toEqual({ ok: false, reason: "exists" });
    const rows = await t.db.select().from(agentActions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "rejected", payload: input.payload });
    expect(await listReminderActions(t.db, a, 10)).toMatchObject([
      {
        id: result.actionId,
        invoiceId,
        invoiceNumber: "2026-27/0001",
        status: "rejected",
        paypalAction: "send_invoice_reminder",
      },
    ]);
    expect(await listReminderActions(t.db, b, 10)).toEqual([]);
    expect(await listReminderActions(t.db, a, 0)).toEqual([]);
  });

  it("aggregates only owned invoice payments by IST month and currency, preserving unknown fees", async () => {
    const a = await user();
    const b = await user();
    const invoiceId = await invoice(a);
    const otherInvoiceId = await invoice(b);
    await t.db.insert(payments).values([
      {
        invoiceId,
        paypalTxnId: "oct",
        kind: "payment",
        gross: "100.00",
        currency: "USD",
        fee: "2.00",
        net: "98.00",
        receivedAt: new Date("2026-10-31T18:29:59Z"),
      },
      {
        invoiceId,
        paypalTxnId: "nov",
        kind: "payment",
        gross: "40.00",
        currency: "USD",
        fee: null,
        net: null,
        receivedAt: new Date("2026-10-31T20:00:00Z"),
      },
      {
        invoiceId,
        paypalTxnId: "nov-known",
        kind: "payment",
        gross: "10.00",
        currency: "USD",
        fee: "1.00",
        net: "9.00",
        receivedAt: new Date("2026-11-01T12:00:00Z"),
      },
      {
        invoiceId,
        paypalTxnId: "eur",
        kind: "payment",
        gross: "20.00",
        currency: "EUR",
        fee: "1.00",
        net: "19.00",
        receivedAt: new Date("2026-11-01T12:00:00Z"),
      },
      {
        invoiceId,
        paypalTxnId: "refund",
        kind: "refund",
        gross: "5.00",
        currency: "USD",
        receivedAt: new Date("2026-11-01T12:00:00Z"),
      },
      {
        invoiceId: otherInvoiceId,
        paypalTxnId: "other",
        kind: "payment",
        gross: "500.00",
        currency: "USD",
        receivedAt: new Date("2026-11-01T12:00:00Z"),
      },
      {
        paypalTxnId: "unlinked",
        kind: "payment",
        gross: "1000.00",
        currency: "USD",
        receivedAt: new Date("2026-11-01T12:00:00Z"),
      },
    ]);
    expect((await monthLedger(t.db, a, "2026-10")).payments).toEqual({
      count: 1,
      totals: [{ currency: "USD", gross: "100.00", fee: "2.00", net: "98.00" }],
    });
    expect(await monthLedger(t.db, a, "2026-11")).toEqual({
      payments: {
        count: 3,
        totals: [
          { currency: "EUR", gross: "20.00", fee: "1.00", net: "19.00" },
          { currency: "USD", gross: "50.00", fee: null, net: null },
        ],
      },
      refunds: { count: 1, totals: [{ currency: "USD", gross: "5.00" }] },
      openDisputes: 0,
      fira: { lines: 0, needsConfirmation: 0, unmatched: 0 },
    });
    expect((await monthLedger(t.db, a, "2026-12")).payments).toEqual({ count: 0, totals: [] });
  });

  it("counts open owned disputes and FIRA line dates with the existing match rule", async () => {
    const a = await user();
    const b = await user();
    const invoiceId = await invoice(a);
    const otherInvoiceId = await invoice(b);
    await t.db.insert(disputes).values([
      {
        invoiceId,
        paypalDisputeId: "open",
        status: "OPEN",
        amount: "10",
        currency: "USD",
        reason: "test",
        paypalUpdatedAt: now,
      },
      {
        invoiceId,
        paypalDisputeId: "resolved",
        status: "RESOLVED",
        amount: "10",
        currency: "USD",
        reason: "test",
        paypalUpdatedAt: now,
      },
      {
        invoiceId: otherInvoiceId,
        paypalDisputeId: "other",
        status: "OPEN",
        amount: "10",
        currency: "USD",
        reason: "test",
        paypalUpdatedAt: now,
      },
    ]);
    for (const userId of [a, b]) {
      const doc = randomUUID();
      await t.db.insert(firaDocuments).values({
        id: doc,
        userId,
        month: "2026-10-01",
        fileUrl: "synthetic",
        parsedAt: now,
        sha256: doc,
      });
      for (let position = 1; position <= 5; position++) {
        const lineId = randomUUID();
        await t.db.insert(firaLines).values({
          id: lineId,
          firaDocumentId: doc,
          date: position === 5 ? "2026-11-01" : "2026-10-31",
          amount: "10",
          currency: "USD",
          reference: "test",
          position,
          sourceText: "Synthetic",
        });
        if (position <= 3) {
          const paymentId = randomUUID();
          await t.db.insert(payments).values({
            id: paymentId,
            invoiceId: userId === a ? invoiceId : otherInvoiceId,
            paypalTxnId: paymentId,
            kind: "payment",
            gross: "10",
            currency: "USD",
          });
          await t.db.insert(matches).values({
            firaLineId: lineId,
            paymentId,
            confidence: position === 1 ? "0.90" : "0.70",
            confirmedByUser: position === 2,
          });
        }
      }
    }
    const ledger = await monthLedger(t.db, a, "2026-10");
    expect(ledger.openDisputes).toBe(1);
    expect(ledger.fira).toEqual({ lines: 4, needsConfirmation: 1, unmatched: 1 });
    expect((await monthLedger(t.db, a, "2026-11")).fira).toEqual({
      lines: 1,
      needsConfirmation: 0,
      unmatched: 1,
    });
  });
});
