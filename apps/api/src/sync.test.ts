import * as dbModule from "@niryat/db";
import { payments, recordPayment } from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import type { CaptureRecord, PayPalLedger } from "@niryat/paypal";
import * as paypalModule from "@niryat/paypal";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main, syncPayments } from "./sync";

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
          seen: failed ? 1 : 0,
          alreadyRecorded: 0,
          recorded: 0,
          skipped: 0,
          failed: failed ? 1 : 0,
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
  const ledger: PayPalLedger = { getCapture, searchTransactions };

  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    getCapture.mockReset().mockResolvedValue(capture);
    searchTransactions.mockReset().mockResolvedValue([
      { transactionId: "CAPTURE-KNOWN", eventCode: "T0006" },
      { transactionId: capture.captureId, eventCode: "T0006" },
      { transactionId: "IGNORED", eventCode: "T1900" },
    ]);
  });
  afterAll(async () => t?.close());

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
});
