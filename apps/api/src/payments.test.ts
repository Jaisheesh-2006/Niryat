import * as dbModule from "@niryat/db";
import type { CaptureRecord, PayPalLedger } from "@niryat/paypal";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordCapture } from "./payments";

const capture: CaptureRecord = {
  captureId: "CAPTURE-TEST",
  status: "COMPLETED",
  paypalInvoiceId: "INV2-TEST",
  gross: "100.00",
  fee: "4.40",
  net: "95.60",
  currency: "USD",
  fxRate: null,
  createTime: "2026-10-26T12:00:00Z",
};

describe("capture recording", () => {
  const database = dbModule.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const getCapture = vi.fn<PayPalLedger["getCapture"]>();
  const deps = { db: database.db, ledger: { getCapture } };

  beforeEach(() => {
    getCapture.mockReset();
    vi.spyOn(dbModule, "recordPayment").mockResolvedValue({ invoiceId: null });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => database.close());

  it.each(["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"])(
    "records a %s capture without changing its amounts",
    async (status) => {
      const result = { ...capture, status };
      getCapture.mockResolvedValue(result);
      expect(await recordCapture(deps, capture.captureId)).toBe("recorded");
      expect(getCapture).toHaveBeenCalledExactlyOnceWith(capture.captureId);
      expect(dbModule.recordPayment).toHaveBeenCalledExactlyOnceWith(database.db, result);
    },
  );

  it.each(["PENDING", "DECLINED", "FAILED"])("skips a %s capture", async (status) => {
    getCapture.mockResolvedValue({ ...capture, status });
    expect(await recordCapture(deps, capture.captureId)).toBe("not_completed");
    expect(dbModule.recordPayment).not.toHaveBeenCalled();
  });

  it("skips a missing capture", async () => {
    getCapture.mockResolvedValue(null);
    expect(await recordCapture(deps, capture.captureId)).toBe("not_found");
    expect(dbModule.recordPayment).not.toHaveBeenCalled();
  });
});
