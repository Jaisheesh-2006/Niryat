import { randomBytes } from "node:crypto";
import { clients, createDb, createUser, type Db, invoices, payments } from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import type { CaptureRecord, PayPalLedger, PayPalRestClient } from "@niryat/paypal";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../index";
import { recordCapture } from "../payments";
import type { AppDeps } from "./auth";

const headers = {
  "Content-Type": "application/json",
  "paypal-transmission-id": "transmission-id",
  "paypal-transmission-time": "2026-10-26T12:00:00Z",
  "paypal-transmission-sig": "signature",
  "paypal-cert-url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/TEST",
  "paypal-auth-algo": "SHA256withRSA",
};
const capture: CaptureRecord = {
  captureId: "CAPTURE-TEST",
  status: "COMPLETED",
  paypalInvoiceId: "INV2-TEST",
  gross: "100.00",
  fee: "4.40",
  net: "95.60",
  currency: "USD",
  fxRate: "83.2500",
  createTime: "2026-10-26T12:00:00Z",
};
const captureEvent = {
  id: "WH-CAPTURE",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: capture.captureId },
};
const invoiceEvent = {
  id: "WH-INVOICE",
  event_type: "INVOICING.INVOICE.PAID",
  resource: {
    invoice: { payments: { transactions: [{ payment_id: capture.captureId }] } },
  },
};

function setup(db: Db) {
  const verify = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ verification_status: "SUCCESS" });
  const getCapture = vi.fn<PayPalLedger["getCapture"]>().mockResolvedValue(capture);
  const rest: PayPalRestClient = {
    async get() {
      throw new Error("Unexpected PayPal read");
    },
    async post(path, _body, _requestId, parse) {
      expect(path).toBe("/v1/notifications/verify-webhook-signature");
      return parse(await verify());
    },
  };
  const ledger: PayPalLedger = {
    getCapture,
    async searchTransactions() {
      throw new Error("Unexpected transaction search");
    },
  };
  const deps: AppDeps = {
    db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
    paypal: { rest, ledger, webhookId: "WH-TEST" },
  };
  const app = createApp(deps);
  function deliver(
    event: unknown = captureEvent,
    requestHeaders: RequestInit["headers"] = headers,
  ) {
    return app.request("/webhooks/paypal", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(event),
    });
  }
  return { deps, app, ledger, verify, getCapture, deliver };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("webhook boundaries without a database connection", () => {
  const t = createDb("postgres://unused:unused@127.0.0.1:1/unused");
  let f: ReturnType<typeof setup>;

  beforeEach(() => {
    vi.spyOn(t.db, "transaction").mockRejectedValue(new Error("Unexpected database access"));
    f = setup(t.db);
  });
  afterAll(async () => t.close());

  it("does not mount the webhook route without PayPal configuration", async () => {
    const { paypal: _paypal, ...deps } = f.deps;
    for (const app of [createApp(), createApp(deps)]) {
      expect((await app.request("/webhooks/paypal", { method: "POST", headers })).status).toBe(404);
    }
  });

  it("rejects bad signatures before any capture read or write", async () => {
    f.verify.mockResolvedValue({ verification_status: "FAILURE" });
    const response = await f.deliver();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(f.getCapture).not.toHaveBeenCalled();
    expect(t.db.transaction).not.toHaveBeenCalled();
  });

  it.each(Object.keys(headers).filter((key) => key.startsWith("paypal-")))(
    "rejects a missing %s without verification or writes",
    async (key) => {
      const missing = new Headers(headers);
      missing.delete(key);
      const response = await f.deliver(captureEvent, missing);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_signature" });
      expect(f.verify).not.toHaveBeenCalled();
      expect(f.getCapture).not.toHaveBeenCalled();
      expect(t.db.transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects non-JSON and oversized bodies before verification", async () => {
    for (const [body, status] of [
      ["not JSON", 400],
      ["x".repeat(300 * 1024), 413],
    ] as const) {
      const response = await f.app.request("/webhooks/paypal", { method: "POST", headers, body });
      expect(response.status).toBe(status);
      if (status === 400) expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(f.verify).not.toHaveBeenCalled();
    expect(f.getCapture).not.toHaveBeenCalled();
    expect(t.db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { ...captureEvent, resource: {} },
    { ...captureEvent, resource: { id: 42 } },
    { ...invoiceEvent, resource: { payments: { transactions: [] } } },
    {
      ...invoiceEvent,
      resource: { invoice: { payments: { transactions: [{ payment_id: 42 }] } } },
    },
  ])("rejects malformed verified envelopes and resources", async (event) => {
    const response = await f.deliver(event);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(f.verify).toHaveBeenCalledOnce();
    expect(f.getCapture).not.toHaveBeenCalled();
    expect(t.db.transaction).not.toHaveBeenCalled();
  });

  it("ignores refunds after signature verification", async () => {
    const response = await f.deliver({ ...captureEvent, event_type: "PAYMENT.CAPTURE.REFUNDED" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ignored" });
    expect(f.verify).toHaveBeenCalledOnce();
    expect(f.getCapture).not.toHaveBeenCalled();
    expect(t.db.transaction).not.toHaveBeenCalled();
  });

  it.each([null, { ...capture, status: "PENDING" }])(
    "skips missing and incomplete captures without writing",
    async (result) => {
      f.getCapture.mockResolvedValue(result);
      expect(await recordCapture({ db: t.db, ledger: f.ledger }, capture.captureId)).toBe(
        result ? "not_completed" : "not_found",
      );
      const response = await f.deliver();
      expect(response.status).toBe(200);
      expect(t.db.transaction).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith({
        event_type: captureEvent.event_type,
        recorded: 0,
        not_completed: result ? 1 : 0,
        not_found: result ? 0 : 1,
      });
    },
  );

  it.each(["verify", "capture", "save"])("returns a safe 500 on %s failure", async (step) => {
    const secret = "private-paypal-response";
    if (step === "verify") f.verify.mockRejectedValue(new Error(secret));
    if (step === "capture") f.getCapture.mockRejectedValue(new Error(secret));
    const response = await f.deliver();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe.skipIf(!testDatabaseUrl)("webhook payment storage", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let f: ReturnType<typeof setup>;

  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    f = setup(t.db);
  });
  afterAll(async () => t?.close());

  async function sentInvoice() {
    const user = await createUser(t.db, {
      email: "webhooks@example.com",
      passwordHash: "test-password-hash",
    });
    if (!user) throw new Error("Test user was not created");
    const [client] = await t.db
      .insert(clients)
      .values({ userId: user.id, name: "Acme Inc", country: "US" })
      .returning();
    if (!client) throw new Error("Test client was not created");
    const [invoice] = await t.db
      .insert(invoices)
      .values({
        userId: user.id,
        clientId: client.id,
        type: "one_time",
        number: "2026-27/0001",
        fy: "2026-27",
        seq: 1,
        date: "2026-10-26",
        currency: "USD",
        amount: "100.00",
        description: "Software development",
        sac: "998314",
        paypalInvoiceId: capture.paypalInvoiceId,
        status: "sent",
      })
      .returning();
    if (!invoice) throw new Error("Test invoice was not created");
    return invoice;
  }

  it("rejects an invalid signature without storing payments", async () => {
    await sentInvoice();
    f.verify.mockResolvedValue({ verification_status: "FAILURE" });
    expect((await f.deliver()).status).toBe(400);
    expect(f.getCapture).not.toHaveBeenCalled();
    expect(await t.db.select().from(payments)).toEqual([]);
  });

  it("records the capture strings, links the sent invoice and marks it paid", async () => {
    const invoice = await sentInvoice();
    const response = await f.deliver();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "recorded" });
    expect(f.getCapture).toHaveBeenCalledExactlyOnceWith(capture.captureId);
    expect(await t.db.select().from(payments)).toEqual([
      expect.objectContaining({
        invoiceId: invoice.id,
        paypalTxnId: capture.captureId,
        gross: capture.gross,
        fee: capture.fee,
        net: capture.net,
        currency: capture.currency,
        fxRate: capture.fxRate,
        receivedAt: new Date(capture.createTime),
      }),
    ]);
    expect(await t.db.select().from(invoices)).toEqual([
      expect.objectContaining({ id: invoice.id, status: "paid" }),
    ]);
    expect(console.log).toHaveBeenCalledWith({
      event_type: captureEvent.event_type,
      recorded: 1,
      not_completed: 0,
      not_found: 0,
    });
  });

  it.each([captureEvent, invoiceEvent])(
    "dedupes replays and overlapping event types",
    async (first) => {
      await sentInvoice();
      expect((await f.deliver(first)).status).toBe(200);
      expect((await f.deliver(first)).status).toBe(200);
      expect((await f.deliver(captureEvent)).status).toBe(200);
      expect(await t.db.select().from(payments)).toHaveLength(1);
    },
  );

  it("reads every invoice payment and safely retries after a later capture fails", async () => {
    await sentInvoice();
    f.getCapture
      .mockResolvedValueOnce(capture)
      .mockRejectedValueOnce(new Error("Capture read failed"));
    const event = {
      ...invoiceEvent,
      resource: {
        invoice: {
          payments: {
            transactions: [{ payment_id: capture.captureId }, { payment_id: "CAPTURE-2" }],
          },
        },
      },
    };
    expect((await f.deliver(event)).status).toBe(500);
    expect(await t.db.select().from(payments)).toHaveLength(1);
    f.getCapture.mockImplementation(async (id) => ({ ...capture, captureId: id }));
    expect((await f.deliver(event)).status).toBe(200);
    expect(f.getCapture).toHaveBeenCalledWith("CAPTURE-2");
    expect(await t.db.select().from(payments)).toHaveLength(2);
  });

  it("leaves pending captures unrecorded and unmatched completed captures unlinked", async () => {
    await sentInvoice();
    f.getCapture.mockResolvedValueOnce({ ...capture, status: "PENDING" });
    expect((await f.deliver()).status).toBe(200);
    expect(await t.db.select().from(payments)).toEqual([]);
    f.getCapture.mockResolvedValueOnce({ ...capture, paypalInvoiceId: "INV2-UNKNOWN" });
    expect((await f.deliver()).status).toBe(200);
    expect(await t.db.select().from(payments)).toEqual([
      expect.objectContaining({ invoiceId: null, paypalTxnId: capture.captureId }),
    ]);
    expect(await t.db.select().from(invoices)).toEqual([
      expect.objectContaining({ status: "sent" }),
    ]);
  });
});
