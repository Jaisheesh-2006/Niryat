import * as dbModule from "@niryat/db";
import {
  clients,
  createUser,
  getInvoice,
  invoices,
  payments,
  recordPayment,
  tasks,
} from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import type { CaptureRecord, PayPalLedger, PayPalRestClient } from "@niryat/paypal";
import * as paypalModule from "@niryat/paypal";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as paymentModule from "./payments";
import { main, syncDisputes, syncPayments } from "./sync";

const now = new Date("2026-10-26T20:30:00.000Z");
const capture: CaptureRecord = {
  captureId: "CAPTURE-UNKNOWN",
  status: "COMPLETED",
  paypalInvoiceId: null,
  gross: "100.00",
  fee: "4.40",
  net: "95.60",
  currency: "USD",
  fxRate: null,
  createTime: "2026-10-26T12:00:00Z",
};

describe("payment sync CLI", () => {
  let database: ReturnType<typeof dbModule.createDb>;
  let exitCode: typeof process.exitCode;
  const close = vi.fn<() => Promise<void>>();
  const getCapture = vi.fn<PayPalLedger["getCapture"]>();
  const searchTransactions = vi.fn<PayPalLedger["searchTransactions"]>();
  const getDisputes: PayPalRestClient["get"] = async (_path, parse) =>
    parse({ items: [], links: [] });

  beforeEach(() => {
    exitCode = process.exitCode;
    process.exitCode = 0;
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [key, value] of Object.entries({
      DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unused",
      ENCRYPTION_KEY: "test-key",
      SESSION_SECRET: "x".repeat(32),
      PAYPAL_CLIENT_ID: "test-client-id",
      PAYPAL_CLIENT_SECRET: "test-secret",
      PAYPAL_WEBHOOK_ID: "test-webhook-id",
      PAYPAL_ENVIRONMENT: "SANDBOX",
      PUBLIC_APP_URL: "http://localhost:3000",
      PORT: "3001",
      NODE_ENV: "test",
    })) {
      vi.stubEnv(key, value);
    }
    database = dbModule.createDb("postgres://unused:unused@127.0.0.1:1/unused");
    close.mockReset().mockResolvedValue(undefined);
    getCapture.mockReset().mockRejectedValue(new Error("private capture detail"));
    searchTransactions.mockReset().mockResolvedValue([]);
    vi.spyOn(dbModule, "createDb").mockReturnValue({ db: database.db, close });
    vi.spyOn(dbModule, "knownTransactionIds").mockResolvedValue(new Set());
    vi.spyOn(paypalModule, "createPayPalLedger").mockReturnValue({
      getCapture,
      searchTransactions,
      async getRefund() {
        throw new Error("Unexpected refund read");
      },
      async refundCapture() {
        throw new Error("Unexpected refund request");
      },
    });
    vi.spyOn(paypalModule, "createPayPalRestClient").mockReturnValue({
      get: getDisputes,
      async post() {
        throw new Error("Unexpected PayPal post");
      },
    });
  });
  afterEach(async () => {
    process.exitCode = exitCode;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await database?.close();
  });

  it.each([false, true])(
    "prints one summary and sets the exit status (failed: %s)",
    async (failed) => {
      if (failed) {
        searchTransactions.mockResolvedValue([
          { transactionId: "CAPTURE-FAILED", eventCode: "T0006" },
        ]);
      }
      await main();
      expect(console.log).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({
          payments: {
            seen: failed ? 1 : 0,
            alreadyRecorded: 0,
            recorded: 0,
            skipped: 0,
            failed: failed ? 1 : 0,
          },
          disputes: { seen: 0, recorded: 0, notFound: 0, failed: 0 },
        }),
      );
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(failed ? 1 : 0);
      expect(close).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it("reports a search failure safely, exits unsuccessfully and closes the database", async () => {
    searchTransactions.mockRejectedValue(new Error("private search detail"));
    await main();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Payment sync failed");
    expect(process.exitCode).toBe(1);
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });

  it.each(["recorded", "not_found", "not_completed"] as const)(
    "recovers an explicit refund without transaction search (status: %s)",
    async (status) => {
      const recordRefund = vi.spyOn(paymentModule, "recordRefundById").mockResolvedValue(status);

      await main(["--refund-id", "REFUND-MISSED"]);

      expect(recordRefund).toHaveBeenCalledExactlyOnceWith(
        { db: database.db, ledger: expect.objectContaining({ getCapture }) },
        "REFUND-MISSED",
      );
      expect(searchTransactions).not.toHaveBeenCalled();
      expect(paypalModule.createPayPalRestClient).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ refund: { status } }));
      expect(console.error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(status === "recorded" ? 0 : 1);
      expect(close).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it("reports an explicit refund failure safely and closes the database", async () => {
    vi.spyOn(paymentModule, "recordRefundById").mockRejectedValue(
      new Error("private refund detail"),
    );

    await main(["--refund-id", "REFUND-FAILED"]);

    expect(searchTransactions).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Payment sync failed");
    expect(process.exitCode).toBe(1);
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    ["--refund-id"],
    ["--refund-id", ""],
    ["--refund-id", "../private"],
    ["--unknown", "private"],
    ["private"],
  ])(
    "rejects invalid recovery arguments before loading environment or clients: %j",
    async (...args) => {
      await main(args);

      expect(process.loadEnvFile).not.toHaveBeenCalled();
      expect(dbModule.createDb).not.toHaveBeenCalled();
      expect(paypalModule.createPayPalLedger).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledExactlyOnceWith(
        "Invalid arguments: refund-id. Use --refund-id <PayPal refund ID>.",
      );
      expect(process.exitCode).toBe(1);
    },
  );

  it("reconciles payment refunds without treating fee refunds or other reversals as refunds", async () => {
    searchTransactions.mockResolvedValue([
      { transactionId: "REFUND-KNOWN", eventCode: "T1107" },
      { transactionId: "REFUND-MISSED", eventCode: "T1107" },
      { transactionId: "REFUND-MISSED", eventCode: "T1107" },
      { transactionId: "FEE-REVERSAL", eventCode: "T1108" },
      { transactionId: "FEE-REFUND", eventCode: "T1109" },
      { transactionId: "DISPUTE-HOLD", eventCode: "T1110" },
      { transactionId: "PAYMENT-REVERSAL", eventCode: "T1106" },
    ]);
    vi.mocked(dbModule.knownTransactionIds).mockResolvedValue(new Set(["REFUND-KNOWN"]));
    const recordRefund = vi.spyOn(paymentModule, "recordRefundById").mockResolvedValue("recorded");

    await main();

    expect(recordRefund.mock.calls.map(([, id]) => id)).toEqual([
      "REFUND-KNOWN",
      "REFUND-MISSED",
      "REFUND-MISSED",
    ]);
    expect(getCapture).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        payments: { seen: 3, alreadyRecorded: 2, recorded: 1, skipped: 0, failed: 0 },
        disputes: { seen: 0, recorded: 0, notFound: 0, failed: 0 },
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  it.each(["not_found", "not_completed"] as const)("skips a %s refund", async (outcome) => {
    searchTransactions.mockResolvedValue([{ transactionId: "REFUND-SKIPPED", eventCode: "T1107" }]);
    vi.spyOn(paymentModule, "recordRefundById").mockResolvedValue(outcome);

    await main();

    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        payments: { seen: 1, alreadyRecorded: 0, recorded: 0, skipped: 1, failed: 0 },
        disputes: { seen: 0, recorded: 0, notFound: 0, failed: 0 },
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("counts a refund failure, continues, and retries even when the refund row is already saved", async () => {
    searchTransactions.mockResolvedValue([
      { transactionId: "REFUND-TASK-FAILED", eventCode: "T1107" },
      { transactionId: "REFUND-NEXT", eventCode: "T1107" },
    ]);
    vi.mocked(dbModule.knownTransactionIds).mockResolvedValue(new Set(["REFUND-TASK-FAILED"]));
    const recordRefund = vi
      .spyOn(paymentModule, "recordRefundById")
      .mockRejectedValueOnce(new Error("private task failure"))
      .mockResolvedValue("recorded");

    await main();
    expect(console.log).toHaveBeenLastCalledWith(
      JSON.stringify({
        payments: { seen: 2, alreadyRecorded: 0, recorded: 1, skipped: 0, failed: 1 },
        disputes: { seen: 0, recorded: 0, notFound: 0, failed: 0 },
      }),
    );
    expect(process.exitCode).toBe(1);
    expect(console.error).not.toHaveBeenCalled();

    vi.mocked(dbModule.knownTransactionIds).mockResolvedValue(
      new Set(["REFUND-TASK-FAILED", "REFUND-NEXT"]),
    );
    process.exitCode = 0;
    await main();
    expect(recordRefund).toHaveBeenCalledTimes(4);
    expect(console.log).toHaveBeenLastCalledWith(
      JSON.stringify({
        payments: { seen: 2, alreadyRecorded: 2, recorded: 0, skipped: 0, failed: 0 },
        disputes: { seen: 0, recorded: 0, notFound: 0, failed: 0 },
      }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("reports a cleanup failure safely and exits unsuccessfully", async () => {
    close.mockRejectedValue(new Error("private database detail"));
    await main();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Payment sync failed");
    expect(process.exitCode).toBe(1);
    expect(close).toHaveBeenCalledExactlyOnceWith();
  });

  it("reports missing configuration before creating a database or ledger", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await main();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Invalid environment: DATABASE_URL. See .env.example.",
    );
    expect(process.exitCode).toBe(1);
    expect(dbModule.createDb).not.toHaveBeenCalled();
    expect(paypalModule.createPayPalLedger).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe.skipIf(!testDatabaseUrl)("payment reconciliation", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const getCapture = vi.fn<PayPalLedger["getCapture"]>();
  const searchTransactions = vi.fn<PayPalLedger["searchTransactions"]>();
  const getRefund = vi.fn<PayPalLedger["getRefund"]>();
  const ledger: PayPalLedger = {
    getCapture,
    searchTransactions,
    getRefund,
    async refundCapture() {
      throw new Error("Unexpected refund request");
    },
  };

  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    getCapture.mockReset().mockResolvedValue(capture);
    getRefund.mockReset().mockRejectedValue(new Error("Unexpected refund read"));
    searchTransactions.mockReset().mockResolvedValue([
      { transactionId: "CAPTURE-KNOWN", eventCode: "T0006" },
      { transactionId: capture.captureId, eventCode: "T0006" },
      { transactionId: "IGNORED", eventCode: "T1900" },
    ]);
  });
  afterAll(async () => t?.close());
  afterEach(() => vi.restoreAllMocks());

  it("searches seven days, filters events, skips known payments and dedupes the next run", async () => {
    await recordPayment(t.db, { ...capture, captureId: "CAPTURE-KNOWN" });
    expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
      seen: 2,
      alreadyRecorded: 1,
      recorded: 1,
      skipped: 0,
      failed: 0,
    });
    expect(searchTransactions).toHaveBeenCalledExactlyOnceWith({
      start: "2026-10-19T20:30:00.000Z",
      end: now.toISOString(),
    });
    expect(getCapture).toHaveBeenCalledExactlyOnceWith(capture.captureId);
    expect(await t.db.select().from(payments)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paypalTxnId: "CAPTURE-KNOWN" }),
        expect.objectContaining({
          paypalTxnId: capture.captureId,
          gross: capture.gross,
          fee: capture.fee,
          net: capture.net,
        }),
      ]),
    );
    getCapture.mockClear();
    expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
      seen: 2,
      alreadyRecorded: 2,
      recorded: 0,
      skipped: 0,
      failed: 0,
    });
    expect(getCapture).not.toHaveBeenCalled();
    expect(await t.db.select().from(payments)).toHaveLength(2);
  });

  it.each([false, true])(
    "recovers missed refunds and tasks without duplicates (task write fails: %s)",
    async (taskFails) => {
      const user = await createUser(t.db, { email: "sync@example.com", passwordHash: "test-hash" });
      if (!user) throw new Error("Test user was not created");
      const [client] = await t.db
        .insert(clients)
        .values({ userId: user.id, name: "Test Client", country: "US" })
        .returning();
      if (!client) throw new Error("Test client was not created");
      const linkedCapture = { ...capture, paypalInvoiceId: "INV2-REFUND-SYNC" };
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
          pdfUrl: "https://example.invalid/api/files/test",
          paypalInvoiceId: linkedCapture.paypalInvoiceId,
          status: "sent",
        })
        .returning();
      if (!invoice) throw new Error("Test invoice was not created");
      getCapture.mockResolvedValue(linkedCapture);
      getRefund.mockImplementation(async (id) => ({
        refundId: id,
        status: "COMPLETED",
        captureId: linkedCapture.captureId,
        paypalInvoiceId: linkedCapture.paypalInvoiceId,
        gross: id === "REFUND-APPROVED" ? "40.00" : "60.00",
        fee: "0.00",
        net: id === "REFUND-APPROVED" ? "40.00" : "60.00",
        currency: "USD",
        createTime: "2026-10-26T13:00:00Z",
      }));
      await recordPayment(t.db, linkedCapture);
      await paymentModule.recordRefundById({ db: t.db, ledger }, "REFUND-APPROVED");
      expect((await getInvoice(t.db, user.id, invoice.id))?.status).toBe("partially_refunded");
      const [approvedTask] = await dbModule.listTasks(t.db, user.id);
      if (!approvedTask) throw new Error("Test refund task was not created");
      const completedTask = await dbModule.completeTask(t.db, user.id, approvedTask.id);
      searchTransactions.mockResolvedValue([
        { transactionId: "REFUND-MISSED", eventCode: "T1107" },
        { transactionId: linkedCapture.captureId, eventCode: "T0006" },
        { transactionId: "REFUND-APPROVED", eventCode: "T1107" },
      ]);
      if (taskFails)
        vi.spyOn(dbModule, "ensureTask").mockRejectedValueOnce(new Error("Task save failed"));

      expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
        seen: 3,
        alreadyRecorded: 2,
        recorded: taskFails ? 0 : 1,
        skipped: 0,
        failed: taskFails ? 1 : 0,
      });
      expect(await getInvoice(t.db, user.id, invoice.id)).toMatchObject({
        status: "refunded",
        paidTotal: "100.00",
        refundedTotal: "100.00",
        refunds: expect.arrayContaining([
          expect.objectContaining({
            paypalTxnId: "REFUND-MISSED",
            gross: "60.00",
            fee: "0.00",
            net: "60.00",
          }),
        ]),
      });
      expect(await t.db.select().from(tasks)).toHaveLength(taskFails ? 1 : 2);
      expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
        seen: 3,
        alreadyRecorded: 3,
        recorded: 0,
        skipped: 0,
        failed: 0,
      });
      expect(await t.db.select().from(payments)).toHaveLength(3);
      expect(await t.db.select().from(tasks)).toHaveLength(2);
      expect(
        (await dbModule.listTasks(t.db, user.id)).find((task) => task.id === approvedTask.id),
      ).toEqual(completedTask);
    },
  );

  it("counts a failed capture and continues recording later rows", async () => {
    getCapture.mockRejectedValueOnce(new Error("Capture read failed"));
    expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
      seen: 2,
      alreadyRecorded: 0,
      recorded: 1,
      skipped: 0,
      failed: 1,
    });
    expect(getCapture.mock.calls).toEqual([["CAPTURE-KNOWN"], [capture.captureId]]);
    expect(await t.db.select().from(payments)).toEqual([
      expect.objectContaining({ paypalTxnId: capture.captureId }),
    ]);
  });

  it("skips missing and incomplete captures", async () => {
    getCapture.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...capture, status: "PENDING" });
    expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
      seen: 2,
      alreadyRecorded: 0,
      recorded: 0,
      skipped: 2,
      failed: 0,
    });
    expect(await t.db.select().from(payments)).toEqual([]);
  });

  it("returns an empty summary when no payment events are found", async () => {
    searchTransactions.mockResolvedValue([{ transactionId: "IGNORED", eventCode: "T1900" }]);
    expect(await syncPayments({ db: t.db, ledger }, now)).toEqual({
      seen: 0,
      alreadyRecorded: 0,
      recorded: 0,
      skipped: 0,
      failed: 0,
    });
    expect(getCapture).not.toHaveBeenCalled();
  });

  it("propagates a search failure instead of reporting a successful empty run", async () => {
    searchTransactions.mockRejectedValue(new Error("Transaction search failed"));
    await expect(syncPayments({ db: t.db, ledger }, now)).rejects.toThrow(
      "Transaction search failed",
    );
    expect(getCapture).not.toHaveBeenCalled();
    expect(await t.db.select().from(payments)).toEqual([]);
  });

  it("continues dispute sync after one dispute fails", async () => {
    const rest: PayPalRestClient = {
      async get(path, parse) {
        if (path.includes("update_time_after=")) {
          return parse({
            items: [{ dispute_id: "PP-DISPUTE-1" }, { dispute_id: "PP-DISPUTE-2" }],
            links: [],
          });
        }
        if (path.endsWith("/PP-DISPUTE-1")) {
          return parse({
            dispute_id: "PP-DISPUTE-1",
            disputed_transactions: [{ seller_transaction_id: "CAPTURE-MISSING" }],
            dispute_amount: { value: "40.00", currency_code: "USD" },
            reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
            status: "OPEN",
            update_time: "2026-10-26T12:00:00Z",
          });
        }
        throw new Error("dispute read failed");
      },
      async post() {
        throw new Error("Unexpected PayPal post");
      },
    };
    const ledger: Pick<PayPalLedger, "getCapture"> = {
      async getCapture() {
        return null;
      },
    };

    expect(await syncDisputes({ db: t.db, rest, ledger }, now)).toEqual({
      seen: 2,
      recorded: 1,
      notFound: 0,
      failed: 1,
    });
  });
});
