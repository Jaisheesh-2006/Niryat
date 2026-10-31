import { randomBytes, randomUUID } from "node:crypto";
import type { CaptureRecord, RefundRecord } from "@niryat/paypal";
import type { InvoiceInput } from "@niryat/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionStore,
  agentActions,
  clients,
  completeTask,
  createUser,
  ensureTask,
  findPdfByToken,
  firaDocuments,
  firaLines,
  getInvoice,
  getInvoiceForAction,
  gstRegistration,
  invoices,
  issueInvoice,
  knownTransactionIds,
  listInvoices,
  listTasks,
  markSent,
  matches,
  paymentLink,
  payments,
  profiles,
  proposeRefund,
  proposeReminder,
  recordPayment,
  recordRefund,
  rejectAction,
  reminderKeys,
  setPayPalInvoiceId,
  setPayPalSeriesId,
  tasks,
  upsertDispute,
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
const refund: RefundRecord = {
  refundId: "REFUND-1",
  status: "COMPLETED",
  captureId: capture.captureId,
  paypalInvoiceId: capture.paypalInvoiceId,
  gross: "40.00",
  fee: "1.00",
  net: "39.00",
  currency: "USD",
  createTime: "2026-10-27T12:00:00Z",
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

  it("serializes concurrent refund proposals and blocks each open action status", async () => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, capture);
    const payment = (await getInvoice(t.db, userId, invoice.id))?.payments[0];
    if (!payment) throw new Error("Expected a payment");
    const payloadFor = vi.fn(
      (p: { invoiceId: string; invoiceNumber: string; captureId: string; currency: string }) => ({
        ...p,
      }),
    );
    const results = await Promise.all([
      proposeRefund(t.db, userId, payment.id, "20", payloadFor),
      proposeRefund(t.db, userId, payment.id, "20", payloadFor),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        { ok: true, invoiceId: invoice.id },
        { ok: false, reason: "refund_pending" },
      ]),
    );
    expect(payloadFor).toHaveBeenCalledExactlyOnceWith({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      captureId: capture.captureId,
      currency: capture.currency,
    });
    const action = (await getInvoice(t.db, userId, invoice.id))?.refundActions[0];
    if (!action) throw new Error("Expected a refund action");
    for (const status of ["approved", "failed"]) {
      await t.db.update(agentActions).set({ status }).where(eq(agentActions.id, action.id));
      expect(await proposeRefund(t.db, userId, payment.id, "20", payloadFor)).toEqual({
        ok: false,
        reason: "refund_pending",
      });
    }
  });

  it("subtracts only refunds for the capture in its currency and keeps decimal precision", async () => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, { ...capture, gross: "0.30" });
    const payment = (await getInvoice(t.db, userId, invoice.id))?.payments[0];
    if (!payment) throw new Error("Expected a payment");
    await recordRefund(t.db, { ...refund, gross: "0.10" });
    await recordRefund(t.db, {
      ...refund,
      refundId: "OTHER-CURRENCY",
      currency: "EUR",
      gross: "60",
    });
    await recordRefund(t.db, {
      ...refund,
      refundId: "OTHER-CAPTURE",
      captureId: "OTHER",
      gross: "60",
    });
    const payloadFor = () => ({});
    expect(await proposeRefund(t.db, userId, payment.id, "0.21", payloadFor)).toEqual({
      ok: false,
      reason: "refund_exceeds_payment",
    });
    expect(await proposeRefund(t.db, userId, payment.id, "0.20", payloadFor)).toEqual({
      ok: true,
      invoiceId: invoice.id,
    });
  });

  it("rolls back a refund proposal if its immutable payload cannot be built", async () => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, capture);
    const payment = (await getInvoice(t.db, userId, invoice.id))?.payments[0];
    if (!payment) throw new Error("Expected a payment");
    await expect(
      proposeRefund(t.db, userId, payment.id, "20", () => {
        throw new Error("private detail");
      }),
    ).rejects.toThrow("Refund proposal save failed");
    expect((await getInvoice(t.db, userId, invoice.id))?.refundActions).toEqual([]);
    expect(await proposeRefund(t.db, userId, payment.id, "20", () => ({}))).toEqual({
      ok: true,
      invoiceId: invoice.id,
    });
  });

  it("shares financial-year numbering across users while keeping their invoices isolated", async () => {
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
      refundedTotal: "0",
      refunds: [],
      disputes: [],
      status: "issued",
      action: { status: "proposed", payload: { detail: { note: "Test PDF" } } },
    });
    const b = await seller("b@example.com");
    expect((await issueInvoice(t.db, b.userId, b.input, finalize, numberFor)).number).toBe(
      numberFor(4),
    );
    expect(await listInvoices(t.db, a.userId)).toEqual([...issued].reverse());
    expect(await listInvoices(t.db, b.userId)).toMatchObject([{ number: numberFor(4) }]);
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

  it("serializes concurrent issues across users without duplicate sequences", async () => {
    const a = await seller();
    const b = await seller("b@example.com");
    const issued = await Promise.all(
      Array.from({ length: 5 }, (_, index) => {
        const owner = index % 2 === 0 ? a : b;
        return issueInvoice(t.db, owner.userId, owner.input, finalize, numberFor);
      }),
    );
    expect(new Set(issued.map((row) => row.number))).toEqual(
      new Set([1, 2, 3, 4, 5].map(numberFor)),
    );
    expect(new Set((await t.db.select().from(invoices)).map((row) => row.seq))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    );
    expect(await listInvoices(t.db, a.userId)).toHaveLength(3);
    expect(await listInvoices(t.db, b.userId)).toHaveLength(2);
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

  it.each([
    { status: "proposed", error: null, claim: true, reject: true },
    { status: "approved", error: null, claim: false, reject: false },
    { status: "failed", error: "reminder_outcome_unknown", claim: false, reject: false },
    { status: "failed", error: "INVALID_REQUEST", claim: false, reject: true },
    { status: "failed", error: "reminder_not_needed", claim: false, reject: true },
    { status: "failed", error: null, claim: false, reject: true },
    { status: "done", error: null, claim: false, reject: false },
    { status: "rejected", error: null, claim: false, reject: false },
  ])(
    "reminder transitions are owner-scoped and final for $status/$error",
    async ({ status, error, claim, reject }) => {
      const a = await seller();
      const b = await seller("b@example.com");
      const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
      const keys = [60, 30].map((stage) => `reminder:${invoice.id}:${stage}`);
      const rows = await t.db
        .insert(agentActions)
        .values(
          keys.map((dedupeKey) => ({
            userId: a.userId,
            invoiceId: invoice.id,
            paypalAction: "send_invoice_reminder",
            status,
            error,
            payload: {},
            dedupeKey,
          })),
        )
        .returning();
      const [toClaim, toReject] = rows;
      if (!toClaim || !toReject) throw new Error("Expected reminders");
      const store = actionStore(t.db);
      expect(await store.claim(toClaim.id, b.userId)).toBeUndefined();
      expect(await rejectAction(t.db, b.userId, toReject.id)).toBe(false);
      const claims = await Promise.all([
        store.claim(toClaim.id, a.userId),
        store.claim(toClaim.id, a.userId),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(claim ? 1 : 0);
      expect(await store.claim(toClaim.id, a.userId)).toBeUndefined();
      expect(await rejectAction(t.db, a.userId, toReject.id)).toBe(reject);
      expect(await reminderKeys(t.db, a.userId)).toEqual(new Set(keys));
      for (const dedupeKey of keys) {
        expect(
          await proposeReminder(t.db, a.userId, { invoiceId: invoice.id, dedupeKey, payload: {} }),
        ).toEqual({ ok: false, reason: "exists" });
      }
    },
  );

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
      receivedAt: new Date(refund.createTime),
      gross: "100.00",
      currency: "EUR",
    });
    await recordPayment(t.db, capture);
    expect((await listInvoices(t.db, userId))[0]).toMatchObject({
      status: "partially_paid",
      paidTotal: "60.00",
      refundedTotal: "0",
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
      receivedAt: new Date(refund.createTime),
      gross: "100.00",
      currency: "EUR",
    });
    await markSent(t.db, a.userId, invoice.id);
    await markSent(t.db, a.userId, invoice.id);
    expect((await listInvoices(t.db, a.userId))[0]).toMatchObject({
      status: payment.status,
      paidTotal: payment.paidTotal,
    });
  });

  it.each([
    { refunded: "40.00", status: "partially_refunded" },
    { refunded: "100.00", status: "refunded" },
    { refunded: "120.00", status: "refunded" },
  ])("rolls up $refunded in refunds to $status", async ({ refunded, status }) => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, { ...capture, gross: "100.00" });
    await t.db.insert(payments).values({
      invoiceId: invoice.id,
      paypalTxnId: "REFUND",
      captureId: capture.captureId,
      kind: "refund",
      receivedAt: new Date(refund.createTime),
      gross: refunded,
      currency: "USD",
    });
    await recordPayment(t.db, { ...capture, gross: "100.00" });
    expect((await listInvoices(t.db, userId))[0]).toMatchObject({ status, paidTotal: "100.00" });
    await recordPayment(t.db, { ...capture, gross: "100.00" });
    expect((await listInvoices(t.db, userId))[0]?.status).toBe(status);
  });

  it("counts early refunds when marking an invoice sent", async () => {
    const a = await seller();
    const invoice = await issueInvoice(t.db, a.userId, a.input, finalize, numberFor);
    await setPayPalInvoiceId(t.db, a.userId, invoice.id, "INV2-TEST");
    await recordPayment(t.db, { ...capture, gross: "100.00" });
    await t.db.insert(payments).values({
      invoiceId: invoice.id,
      paypalTxnId: "REFUND",
      kind: "refund",
      receivedAt: new Date(refund.createTime),
      gross: "40.00",
      currency: "USD",
    });
    expect((await listInvoices(t.db, a.userId))[0]?.status).toBe("issued");
    await markSent(t.db, a.userId, invoice.id);
    expect((await listInvoices(t.db, a.userId))[0]?.status).toBe("partially_refunded");
  });

  it("records partial and full refunds once, preserving paid totals and PayPal figures", async () => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, { ...capture, gross: "100.00" });
    expect(await paymentLink(t.db, capture.captureId)).toEqual({ invoiceId: invoice.id, userId });
    expect(await recordRefund(t.db, refund)).toEqual({ invoiceId: invoice.id, userId });
    await recordRefund(t.db, refund);
    expect(await getInvoice(t.db, userId, invoice.id)).toMatchObject({
      status: "partially_refunded",
      paidTotal: "100.00",
      refundedTotal: "40.00",
      payments: [{ paypalTxnId: capture.captureId }],
      refunds: [
        {
          paypalTxnId: refund.refundId,
          captureId: capture.captureId,
          gross: "40.00",
          fee: "1.00",
          net: "39.00",
          receivedAt: refund.createTime.replace("Z", ".000Z"),
        },
      ],
    });
    await recordRefund(t.db, {
      ...refund,
      refundId: "REFUND-2",
      gross: "60.00",
      fee: null,
      net: null,
      createTime: "2026-10-28T12:00:00Z",
    });
    const saved = await getInvoice(t.db, userId, invoice.id);
    expect(saved).toMatchObject({
      status: "refunded",
      paidTotal: "100.00",
      refundedTotal: "100.00",
    });
    expect(saved?.refunds.map((row) => row.paypalTxnId)).toEqual(["REFUND-2", "REFUND-1"]);
    expect(await paymentLink(t.db, refund.refundId)).toBeUndefined();
    const b = await seller("b@example.com");
    expect(await getInvoice(t.db, b.userId, invoice.id)).toBeUndefined();
    expect(await getInvoice(t.db, userId, randomUUID())).toBeUndefined();
  });

  it("stores unlinked refunds, falls back to invoice IDs, and preserves links on replay", async () => {
    const { userId, invoice } = await sentInvoice();
    const unknown = { ...refund, captureId: "UNKNOWN", paypalInvoiceId: "INV2-UNKNOWN" };
    expect(await recordRefund(t.db, unknown)).toEqual({ invoiceId: null, userId: null });
    expect(await paymentLink(t.db, "UNKNOWN")).toBeUndefined();
    expect(await t.db.select().from(payments)).toMatchObject([{ invoiceId: null, kind: "refund" }]);
    expect(await recordRefund(t.db, { ...unknown, paypalInvoiceId: "INV2-TEST" })).toEqual({
      invoiceId: invoice.id,
      userId,
    });
    expect(await recordRefund(t.db, unknown)).toEqual({ invoiceId: invoice.id, userId });
    expect((await getInvoice(t.db, userId, invoice.id))?.refunds).toHaveLength(1);
  });

  it("prefers the capture link over an invoice fallback and retains it without either on replay", async () => {
    const { userId, invoice, input } = await sentInvoice();
    const other = await issueInvoice(t.db, userId, input, finalize, numberFor);
    await setPayPalInvoiceId(t.db, userId, other.id, "INV2-OTHER");
    await recordPayment(t.db, capture);
    expect(await recordRefund(t.db, { ...refund, paypalInvoiceId: "INV2-OTHER" })).toEqual({
      invoiceId: invoice.id,
      userId,
    });
    expect(await recordRefund(t.db, { ...refund, captureId: null, paypalInvoiceId: null })).toEqual(
      { invoiceId: invoice.id, userId },
    );
    expect((await getInvoice(t.db, userId, invoice.id))?.refunds).toMatchObject([
      { paypalTxnId: refund.refundId, captureId: capture.captureId },
    ]);
    expect((await getInvoice(t.db, userId, other.id))?.refunds).toEqual([]);
  });

  it("marks a partly paid invoice refunded when all received money is refunded", async () => {
    const { userId, invoice } = await sentInvoice();
    await recordPayment(t.db, capture);
    expect((await getInvoice(t.db, userId, invoice.id))?.status).toBe("partially_paid");
    await recordRefund(t.db, { ...refund, gross: "60.00" });
    expect(await getInvoice(t.db, userId, invoice.id)).toMatchObject({
      status: "refunded",
      paidTotal: "60.00",
      refundedTotal: "60.00",
    });
  });

  it("ignores stale disputes and preserves their invoice link on newer and equal updates", async () => {
    const { userId, invoice } = await sentInvoice();
    const row = {
      paypalDisputeId: "DISPUTE-1",
      captureId: capture.captureId,
      invoiceId: invoice.id,
      amount: "100.00",
      currency: "USD",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      status: "RESOLVED",
      stage: "CHARGEBACK",
      outcome: "RESOLVED_SELLER_FAVOUR",
      responseDueDate: "2026-11-05",
      paypalUpdatedAt: "2026-10-28T12:00:00Z",
    };
    await upsertDispute(t.db, row);
    await upsertDispute(t.db, {
      ...row,
      status: "OPEN",
      paypalUpdatedAt: "2026-10-27T12:00:00Z",
    });
    expect((await getInvoice(t.db, userId, invoice.id))?.disputes).toMatchObject([
      { status: "RESOLVED", outcome: "RESOLVED_SELLER_FAVOUR" },
    ]);
    await upsertDispute(t.db, {
      ...row,
      invoiceId: null,
      status: "WAITING_FOR_BUYER_RESPONSE",
      paypalUpdatedAt: "2026-10-29T12:00:00Z",
    });
    expect((await getInvoice(t.db, userId, invoice.id))?.disputes).toMatchObject([
      { status: "WAITING_FOR_BUYER_RESPONSE" },
    ]);
    await upsertDispute(t.db, {
      ...row,
      invoiceId: null,
      paypalUpdatedAt: "2026-10-29T12:00:00Z",
    });
    expect((await getInvoice(t.db, userId, invoice.id))?.disputes).toMatchObject([
      { paypalDisputeId: row.paypalDisputeId, status: "RESOLVED" },
    ]);
  });

  it("deduplicates tasks, isolates users and completes tasks idempotently", async () => {
    const { userId, invoice } = await sentInvoice();
    const task = {
      userId,
      invoiceId: invoice.id,
      type: "refund_recorded" as const,
      dueDate: null,
      message: "Synthetic refund task",
      sourceRuleId: "CREDIT_NOTE",
      dedupeKey: "refund:REFUND-1",
    };
    const inserted = await Promise.all([ensureTask(t.db, task), ensureTask(t.db, task)]);
    expect(inserted.sort()).toEqual([false, true]);
    expect(await ensureTask(t.db, task)).toBe(false);
    const [saved] = await listTasks(t.db, userId);
    if (!saved) throw new Error("Test task was not saved");
    expect(await listTasks(t.db, userId)).toHaveLength(1);
    const b = await seller("b@example.com");
    expect(await listTasks(t.db, b.userId)).toEqual([]);
    expect(await completeTask(t.db, b.userId, saved.id)).toBeUndefined();
    expect(await completeTask(t.db, userId, randomUUID())).toBeUndefined();
    const completed = await completeTask(t.db, userId, saved.id);
    expect(completed).toMatchObject({ status: "done", doneAt: expect.any(String) });
    expect(await completeTask(t.db, userId, saved.id)).toEqual(completed);
  });

  it("lists open tasks by due date then creation, followed by most recently completed", async () => {
    const { userId } = await sentInvoice();
    await t.db.insert(tasks).values(
      [
        { dedupeKey: "undated", dueDate: null, createdAt: new Date("2026-10-26T10:00:00Z") },
        { dedupeKey: "later", dueDate: "2026-11-02", createdAt: new Date("2026-10-26T10:00:00Z") },
        { dedupeKey: "second", dueDate: "2026-11-01", createdAt: new Date("2026-10-26T12:00:00Z") },
        { dedupeKey: "first", dueDate: "2026-11-01", createdAt: new Date("2026-10-26T11:00:00Z") },
        {
          dedupeKey: "old-done",
          status: "done",
          doneAt: new Date("2026-10-27T12:00:00Z"),
          dueDate: "2026-11-01",
        },
        {
          dedupeKey: "new-done",
          status: "done",
          doneAt: new Date("2026-10-28T12:00:00Z"),
          dueDate: "2026-11-02",
        },
      ].map((row) => ({
        ...row,
        userId,
        type: "refund_recorded",
        sourceRuleId: "CREDIT_NOTE",
        message: row.dedupeKey,
      })),
    );
    expect((await listTasks(t.db, userId)).map((row) => row.message)).toEqual([
      "first",
      "second",
      "later",
      "undated",
      "new-done",
      "old-done",
    ]);
  });

  it("rejects invalid stored tasks without exposing their fields", async () => {
    const { userId } = await sentInvoice();
    const [row] = await t.db
      .insert(tasks)
      .values({
        userId,
        type: "sensitive-invalid-type",
        message: "Sensitive message",
        sourceRuleId: "CREDIT_NOTE",
        dedupeKey: "invalid",
      })
      .returning();
    if (!row) throw new Error("Test task was not saved");
    await expect(listTasks(t.db, userId)).rejects.toThrow("Stored task is invalid");
    await expect(completeTask(t.db, userId, row.id)).rejects.toThrow("Stored task is invalid");
  });

  it("reads GST registration without decrypting profile fields", async () => {
    const { userId } = await sentInvoice();
    expect(await gstRegistration(t.db, userId)).toBeNull();
    await t.db
      .insert(profiles)
      .values({ userId, gstRegistered: true, gstin: "unreadable-ciphertext" });
    expect(await gstRegistration(t.db, userId)).toBe(true);
    await t.db.update(profiles).set({ gstRegistered: false }).where(eq(profiles.userId, userId));
    expect(await gstRegistration(t.db, userId)).toBe(false);
    const b = await seller("b@example.com");
    expect(await gstRegistration(t.db, b.userId)).toBeNull();
  });

  it("rejects duplicate task dedupe keys", async () => {
    const { userId, invoice } = await sentInvoice();
    const task = {
      userId,
      invoiceId: invoice.id,
      type: "refund_recorded",
      sourceRuleId: "REALISATION_ADJUSTMENT",
      message: "Synthetic refund task",
      dedupeKey: "refund:TEST",
    };
    await t.db.insert(tasks).values(task);
    await expect(t.db.insert(tasks).values(task)).rejects.toMatchObject({
      cause: { code: "23505", constraint: "tasks_dedupe_key_unique" },
    });
  });

  it("allows each payment and FIRA line in only one match", async () => {
    const { userId } = await sentInvoice();
    await recordPayment(t.db, capture);
    await recordPayment(t.db, { ...capture, captureId: "CAPTURE-2" });
    const [payment, secondPayment] = await t.db.select().from(payments);
    const [document] = await t.db
      .insert(firaDocuments)
      .values({
        userId,
        month: "2026-10-01",
        fileUrl: "fira/synthetic.pdf",
        parsedAt: new Date("2026-10-27T12:00:00Z"),
        sha256: "synthetic-sha256",
      })
      .returning();
    if (!document || !payment || !secondPayment) throw new Error("Test rows were not saved");
    const [line, secondLine] = await t.db
      .insert(firaLines)
      .values(
        [1, 2].map((position) => ({
          firaDocumentId: document.id,
          position,
          date: "2026-10-26",
          amount: "60.00",
          currency: "USD",
          reference: `SYNTHETIC-${position}`,
          sourceText: "Synthetic FIRA line",
        })),
      )
      .returning();
    if (!line || !secondLine) throw new Error("Test lines were not saved");
    await t.db
      .insert(matches)
      .values({ firaLineId: line.id, paymentId: payment.id, confidence: "1.00" });
    await expect(
      t.db
        .insert(matches)
        .values({ firaLineId: secondLine.id, paymentId: payment.id, confidence: "1.00" }),
    ).rejects.toMatchObject({ cause: { code: "23505", constraint: "matches_payment_id_unique" } });
    await expect(
      t.db
        .insert(matches)
        .values({ firaLineId: line.id, paymentId: secondPayment.id, confidence: "1.00" }),
    ).rejects.toMatchObject({
      cause: { code: "23505", constraint: "matches_fira_line_id_unique" },
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
