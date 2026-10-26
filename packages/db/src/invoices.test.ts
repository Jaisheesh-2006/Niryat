import { randomBytes, randomUUID } from "node:crypto";
import type { CaptureRecord } from "@niryat/paypal";
import type { InvoiceInput } from "@niryat/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionStore,
  agentActions,
  clients,
  createUser,
  findPdfByToken,
  getInvoiceForAction,
  invoices,
  issueInvoice,
  knownTransactionIds,
  listInvoices,
  markSent,
  payments,
  recordPayment,
  rejectAction,
  setPayPalInvoiceId,
  setPayPalSeriesId,
} from "./index";
import { openTestDb, testDatabaseUrl } from "./testing";

const numberFor = (seq: number) => `2026-27/${String(seq).padStart(4, "0")}`;
const finalize = async ({ id }: { id: string }) => ({
  pdfToken: randomBytes(32).toString("base64url"),
  pdfUrl: `https://example.invalid/api/files/${id}`,
  action: { paypalAction: "send_invoice" as const, payload: { detail: { note: "Test PDF" } } },
});
const capture: CaptureRecord = {
  captureId: "CAPTURE-1",
  status: "COMPLETED",
  paypalInvoiceId: "INV2-TEST",
  gross: "60.00",
  fee: "2.00",
  net: "58.00",
  currency: "USD",
  fxRate: null,
  createTime: "2026-10-26T12:00:00Z",
};

describe.skipIf(!testDatabaseUrl)("invoice, action and payment storage", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;

  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function seller(email = "a@example.com") {
    const user = await createUser(t.db, { email, passwordHash: "test-password-hash" });
    if (!user) throw new Error("Test user was not created");
    const [client] = await t.db
      .insert(clients)
      .values({ userId: user.id, name: "Synthetic Client", country: "US" })
      .returning();
    if (!client) throw new Error("Test client was not created");
    const input: InvoiceInput & { date: string; fy: string } = {
      clientId: client.id,
      type: "one_time",
      date: "2026-10-26",
      fy: "2026-27",
      currency: "USD",
      amount: "100.00",
      description: "Software development",
      sac: "998314",
      recurrence: null,
    };
    return { userId: user.id, input };
  }

  async function sentInvoice() {
    const s = await seller();
    const invoice = await issueInvoice(t.db, s.userId, s.input, finalize, numberFor);
    await setPayPalInvoiceId(t.db, s.userId, invoice.id, "INV2-TEST");
    await markSent(t.db, s.userId, invoice.id);
    return { ...s, invoice };
  }

  it("allocates consecutive numbers per user and financial year and lists newest first", async () => {
    const a = await seller();
    const issued = [];
    for (let n = 0; n < 3; n++) {
      issued.push(await issueInvoice(t.db, a.userId, a.input, finalize, numberFor));
    }
    expect(issued.map((row) => row.number)).toEqual([1, 2, 3].map(numberFor));
    expect((await t.db.select().from(invoices)).map((row) => row.seq)).toEqual([1, 2, 3]);
    expect(await listInvoices(t.db, a.userId)).toEqual([...issued].reverse());
    expect(issued[0]).toMatchObject({
      clientName: "Synthetic Client",
      paidTotal: "0",
      payments: [],
      status: "issued",
      action: { status: "proposed", payload: { detail: { note: "Test PDF" } } },
    });
    const b = await seller("b@example.com");
    expect((await issueInvoice(t.db, b.userId, b.input, finalize, numberFor)).number).toBe(
      numberFor(1),
    );
    const nextYear = await issueInvoice(
      t.db,
      a.userId,
      { ...a.input, date: "2027-04-01", fy: "2027-28" },
      finalize,
      (seq) => `2027-28/${String(seq).padStart(4, "0")}`,
    );
    expect(nextYear.number).toBe("2027-28/0001");
    expect((await listInvoices(t.db, a.userId))[0]).toEqual(nextYear);
  });

  it("serializes five concurrent issues without duplicate sequences", async () => {
    const a = await seller();
    const issued = await Promise.all(
      Array.from({ length: 5 }, () => issueInvoice(t.db, a.userId, a.input, finalize, numberFor)),
    );
    expect(new Set(issued.map((row) => row.number))).toEqual(
      new Set([1, 2, 3, 4, 5].map(numberFor)),
    );
    expect(new Set((await t.db.select().from(invoices)).map((row) => row.seq))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    );
  });

  it("rolls back a failed finalize without consuming the next number", async () => {
    const a = await seller();
    await expect(
      issueInvoice(
        t.db,
        a.userId,
        a.input,
        async () => {
          throw new Error("Sensitive upload failure");
        },
        numberFor,
      ),
    ).rejects.toThrow("Invoice save failed");
    expect(await t.db.select().from(invoices)).toEqual([]);
    expect(await t.db.select().from(agentActions)).toEqual([]);
    expect((await issueInvoice(t.db, a.userId, a.input, finalize, numberFor)).number).toBe(
      numberFor(1),
    );
  });

  it("claims atomically, retries failed actions and keeps rejection final", async () => {
    const a = await seller();
    const b = await seller("b@example.com");
    const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    const action = invoice.action;
    if (!action) throw new Error("Test action was not saved");
    const store = actionStore(t.db);
    expect(await store.claim(action.id, b.userId)).toBeUndefined();
    const claims = await Promise.all([
      store.claim(action.id, a.userId),
      store.claim(action.id, a.userId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({
      id: action.id,
      userId: a.userId,
      status: "approved",
      payload: action.payload,
    });
    expect(await store.claim(action.id, a.userId)).toBeUndefined();
    expect(await rejectAction(t.db, a.userId, action.id)).toBe(false);
    await store.finish(action.id, { status: "failed", error: "HTTP_503" });
    expect(await store.claim(action.id, a.userId)).toMatchObject({ status: "approved" });
    await store.finish(action.id, { status: "done" });
    expect((await getInvoiceForAction(t.db, a.userId, action.id))?.action).toMatchObject({
      status: "done",
      error: null,
    });
    expect(await store.claim(action.id, a.userId)).toBeUndefined();
    const second = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    if (!second.action) throw new Error("Test action was not saved");
    expect(await rejectAction(t.db, b.userId, second.action.id)).toBe(false);
    expect(await rejectAction(t.db, a.userId, second.action.id)).toBe(true);
    expect(await rejectAction(t.db, a.userId, second.action.id)).toBe(false);
    expect(await store.claim(second.action.id, a.userId)).toBeUndefined();
    await store.finish(second.action.id, { status: "done" });
    expect((await getInvoiceForAction(t.db, a.userId, second.action.id))?.action?.status).toBe(
      "rejected",
    );
    const third = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    if (!third.action) throw new Error("Test action was not saved");
    await store.claim(third.action.id, a.userId);
    await store.finish(third.action.id, { status: "failed", error: "HTTP_503" });
    expect(await rejectAction(t.db, a.userId, third.action.id)).toBe(true);
    expect((await listInvoices(t.db, a.userId)).map((row) => row.number)).toEqual(
      [3, 2, 1].map(numberFor),
    );
  });

  it("deduplicates captures, copies fee/net/FX and rolls up 60 plus 40 in SQL", async () => {
    const { userId, invoice } = await sentInvoice();
    expect(await recordPayment(t.db, capture)).toEqual({ invoiceId: invoice.id });
    await recordPayment(t.db, capture);
    expect(await t.db.select().from(payments)).toHaveLength(1);
    expect((await listInvoices(t.db, userId))[0]).toMatchObject({
      status: "partially_paid",
      paidTotal: "60.00",
      payments: [{ gross: "60.00", fee: "2.00", net: "58.00", fxRate: null }],
    });
    await recordPayment(t.db, {
      ...capture,
      captureId: "CAPTURE-2",
      gross: "40.00",
      fee: null,
      net: null,
      fxRate: "83.1234",
    });
    await markSent(t.db, userId, invoice.id);
    expect((await listInvoices(t.db, userId))[0]).toMatchObject({
      status: "paid",
      paidTotal: "100.00",
    });
    expect((await listInvoices(t.db, userId))[0]?.payments).toContainEqual(
      expect.objectContaining({
        paypalTxnId: "CAPTURE-2",
        fee: null,
        net: null,
        fxRate: "83.1234",
      }),
    );
    expect(await knownTransactionIds(t.db, ["CAPTURE-1", "CAPTURE-2", "missing"])).toEqual(
      new Set(["CAPTURE-1", "CAPTURE-2"]),
    );
    expect(await knownTransactionIds(t.db, [])).toEqual(new Set());
    expect(
      await recordPayment(t.db, { ...capture, captureId: "UNMATCHED", paypalInvoiceId: null }),
    ).toEqual({
      invoiceId: null,
    });
    expect(await t.db.select().from(payments)).toHaveLength(3);
  });

  it("preserves links on replay, ignores other currencies and non-payment rows in totals", async () => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, capture);
    await recordPayment(t.db, { ...capture, paypalInvoiceId: null });
    await recordPayment(t.db, { ...capture, captureId: "EUR", currency: "EUR", gross: "100.00" });
    await t.db.insert(payments).values({
      invoiceId: invoice.id,
      paypalTxnId: "REFUND",
      kind: "refund",
      gross: "100.00",
      currency: "USD",
    });
    await recordPayment(t.db, capture);
    expect((await listInvoices(t.db, userId))[0]).toMatchObject({
      status: "partially_paid",
      paidTotal: "60.00",
    });
    expect((await listInvoices(t.db, userId))[0]?.payments).toHaveLength(2);
    expect(
      (await t.db.select().from(payments).where(eq(payments.paypalTxnId, capture.captureId)))[0]
        ?.invoiceId,
    ).toBe(invoice.id);
  });

  it("links previously unmatched captures and recurring series without changing issued status", async () => {
    const a = await seller();
    const invoice = await issueInvoice(
      t.db,
      a.userId,
      {
        ...a.input,
        type: "recurring",
        recurrence: { intervalUnit: "MONTH", intervalCount: 1, totalCycles: 2 },
      },
      async (draft) => ({
        ...(await finalize(draft)),
        action: { paypalAction: "create_recurring_series", payload: {} },
      }),
      numberFor,
    );
    expect(await recordPayment(t.db, capture)).toEqual({ invoiceId: null });
    await setPayPalSeriesId(t.db, a.userId, invoice.id, capture.paypalInvoiceId ?? "INV2-TEST");
    expect(await recordPayment(t.db, capture)).toEqual({ invoiceId: invoice.id });
    expect((await listInvoices(t.db, a.userId))[0]).toMatchObject({
      status: "issued",
      paidTotal: "60.00",
    });
  });

  it("counts concurrent payments in the final roll-up", async () => {
    const { userId } = await sentInvoice();
    await Promise.all([
      recordPayment(t.db, capture),
      recordPayment(t.db, { ...capture, captureId: "CAPTURE-2", gross: "40.00" }),
    ]);
    expect((await listInvoices(t.db, userId))[0]).toMatchObject({
      status: "paid",
      paidTotal: "100.00",
    });
  });

  it.each([
    { gross: "60.00", currency: "USD", status: "partially_paid", paidTotal: "60.00" },
    { gross: "100.00", currency: "USD", status: "paid", paidTotal: "100.00" },
    { gross: "100.00", currency: "EUR", status: "sent", paidTotal: "0" },
  ])("counts early $currency payments when marking an invoice $status", async (payment) => {
    const a = await seller();
    const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    await setPayPalInvoiceId(t.db, a.userId, invoice.id, "INV2-TEST");
    await recordPayment(t.db, { ...capture, gross: payment.gross, currency: payment.currency });
    await t.db.insert(payments).values({
      invoiceId: invoice.id,
      paypalTxnId: "REFUND",
      kind: "refund",
      gross: "100.00",
      currency: "USD",
    });
    await markSent(t.db, a.userId, invoice.id);
    await markSent(t.db, a.userId, invoice.id);
    expect((await listInvoices(t.db, a.userId))[0]).toMatchObject({
      status: payment.status,
      paidTotal: payment.paidTotal,
    });
  });

  it("waits for a concurrent early payment before calculating sent status", async () => {
    const a = await seller();
    const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    await setPayPalInvoiceId(t.db, a.userId, invoice.id, "INV2-TEST");
    const ready = Promise.withResolvers<number>();
    const release = Promise.withResolvers<void>();
    const payment = t.db
      .transaction(async (tx) => {
        await recordPayment(tx, { ...capture, gross: "100.00" });
        const [row] = await tx
          .select({ pid: sql<number>`pg_backend_pid()` })
          .from(invoices)
          .where(eq(invoices.id, invoice.id));
        if (!row) throw new Error("Test invoice was not saved");
        ready.resolve(row.pid);
        await release.promise;
      })
      .catch((error: unknown) => {
        ready.reject(error);
        throw error;
      });
    let sending = Promise.resolve();
    try {
      const blocker = await ready.promise;
      sending = markSent(t.db, a.userId, invoice.id);
      await vi.waitFor(async () => {
        const waiters = await t.db.execute(sql`select 1 from pg_stat_activity
          where ${blocker} = any(pg_blocking_pids(pid))`);
        expect(waiters.rowCount).toBeGreaterThan(0);
      });
    } finally {
      release.resolve();
      await Promise.all([payment, sending]);
    }
    expect((await listInvoices(t.db, a.userId))[0]).toMatchObject({
      status: "paid",
      paidTotal: "100.00",
    });
  });

  it("isolates reads and writes and finds PDFs only by their token", async () => {
    const a = await seller();
    const b = await seller("b@example.com");
    const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    if (!invoice.action) throw new Error("Test action was not saved");
    expect(await listInvoices(t.db, b.userId)).toEqual([]);
    expect(await getInvoiceForAction(t.db, b.userId, invoice.action.id)).toBeUndefined();
    expect(await getInvoiceForAction(t.db, a.userId, randomUUID())).toBeUndefined();
    expect(await getInvoiceForAction(t.db, a.userId, invoice.action.id)).toEqual(invoice);
    await setPayPalInvoiceId(t.db, b.userId, invoice.id, "INV2-WRONG");
    await setPayPalSeriesId(t.db, b.userId, invoice.id, "SERIES-WRONG");
    await markSent(t.db, b.userId, invoice.id);
    expect(await listInvoices(t.db, a.userId)).toEqual([invoice]);
    const [row] = await t.db.select().from(invoices);
    if (!row?.pdfToken) throw new Error("Test PDF token was not saved");
    expect(await findPdfByToken(t.db, row.pdfToken)).toEqual({
      userId: a.userId,
      invoiceId: invoice.id,
      number: invoice.number,
    });
    expect(await findPdfByToken(t.db, "unknown")).toBeUndefined();
    await expect(issueInvoice(t.db, b.userId, a.input, finalize, numberFor)).rejects.toThrow(
      "Invoice save failed",
    );
    expect(await listInvoices(t.db, b.userId)).toEqual([]);
  });

  it.each(["recurrence", "payload"])(
    "rejects invalid stored %s JSON without exposing it",
    async (field) => {
      const a = await seller();
      const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
      if (field === "recurrence") {
        await t.db
          .update(invoices)
          .set({ recurrence: { sensitive: "invalid" } })
          .where(eq(invoices.id, invoice.id));
      } else {
        await t.db
          .update(agentActions)
          .set({ payload: ["sensitive"] })
          .where(eq(agentActions.invoiceId, invoice.id));
        if (!invoice.action) throw new Error("Test action was not saved");
        await expect(actionStore(t.db).claim(invoice.action.id, a.userId)).rejects.toThrow(
          "Stored action is invalid",
        );
      }
      await expect(listInvoices(t.db, a.userId)).rejects.toThrow("Stored invoice is invalid");
    },
  );
});
