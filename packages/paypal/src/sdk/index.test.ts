import {
  ApiError,
  type ApiResponse,
  type CapturedPayment,
  CaptureStatus,
  Client,
  Environment,
  type OAuthToken,
  PaymentsController,
  type Refund,
  RefundStatus,
} from "@paypal/paypal-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPayPalLedger, PayPalApiError, toCaptureRecord, toRefundRecord } from "../index";
import { ledgerTokenProvider } from "./index";

const capture: CapturedPayment = {
  id: "CAPTURE123",
  status: CaptureStatus.Completed,
  invoiceId: "INV2-TEST-TEST-TEST-TEST",
  amount: { currencyCode: "USD", value: "100.00" },
  sellerReceivableBreakdown: {
    grossAmount: { currencyCode: "USD", value: "100.00" },
    paypalFee: { currencyCode: "USD", value: "4.96" },
    netAmount: { currencyCode: "USD", value: "95.04" },
  },
  createTime: "2026-10-24T17:30:49Z",
};

it.each([
  { state: "missing", initialToken: undefined },
  {
    state: "expired",
    initialToken: { accessToken: "expired-token", tokenType: "Bearer", expiry: 0n },
  },
])(
  "recovers on the same SDK client after a $state token refresh fails",
  async ({ initialToken }) => {
    const token: OAuthToken = {
      accessToken: "local-test-token",
      tokenType: "Bearer",
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };
    const fetchToken = vi
      .fn<() => Promise<OAuthToken>>()
      .mockRejectedValueOnce(new Error("temporary token failure with private details"))
      .mockResolvedValue(token);
    const adapter = vi.fn(async (config: unknown) => ({
      data: JSON.stringify({ id: "CAPTURE123", status: "COMPLETED" }),
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      config,
    }));
    const client = new Client({
      environment: Environment.Sandbox,
      clientCredentialsAuthCredentials: {
        oAuthClientId: "dummy-id",
        oAuthClientSecret: "dummy-secret",
        ...(initialToken ? { oAuthToken: initialToken } : {}),
        oAuthTokenProvider: (lastToken) => ledgerTokenProvider(lastToken, { fetchToken }),
      },
      unstable_httpClientOptions: { adapter },
    });
    const payments = new PaymentsController(client);

    await expect(payments.getCapturedPayment({ captureId: "CAPTURE123" })).rejects.toThrow(
      "OAuth token is expired",
    );
    expect(adapter).not.toHaveBeenCalled();
    await expect(payments.getCapturedPayment({ captureId: "CAPTURE123" })).resolves.toMatchObject({
      result: { id: "CAPTURE123" },
    });
    await payments.getCapturedPayment({ captureId: "CAPTURE123" });
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(adapter).toHaveBeenCalledTimes(2);
  },
);

describe("toCaptureRecord", () => {
  it("maps the SDK capture without computing money or inventing an exchange rate", () => {
    expect(toCaptureRecord(capture)).toEqual({
      captureId: "CAPTURE123",
      status: "COMPLETED",
      paypalInvoiceId: "INV2-TEST-TEST-TEST-TEST",
      gross: "100.00",
      fee: "4.96",
      net: "95.04",
      currency: "USD",
      fxRate: null,
      createTime: "2026-10-24T17:30:49Z",
    });
  });

  it("keeps fee and net null without a receivable breakdown", () => {
    const { sellerReceivableBreakdown, ...withoutBreakdown } = capture;
    expect(toCaptureRecord(withoutBreakdown)).toMatchObject({
      gross: "100.00",
      currency: "USD",
      fee: null,
      net: null,
      fxRate: null,
    });
  });

  it("rejects a missing amount with a sanitized error", () => {
    const { amount, ...withoutAmount } = capture;
    expect(() => toCaptureRecord(withoutAmount)).toThrow(/^Invalid capture$/);
  });

  it("copies the supplied exchange rate as a string", () => {
    const withFx: CapturedPayment = {
      ...capture,
      sellerReceivableBreakdown: {
        grossAmount: { currencyCode: "USD", value: "100.00" },
        exchangeRate: { sourceCurrency: "USD", targetCurrency: "INR", value: "83.123456789" },
      },
    };
    expect(toCaptureRecord(withFx)).toMatchObject({
      fxRate: "83.123456789",
      fee: null,
      net: null,
    });
  });

  it("keeps an absent invoice ID null and preserves a pending status", () => {
    const { invoiceId, ...withoutInvoice } = capture;
    expect(toCaptureRecord({ ...withoutInvoice, status: CaptureStatus.Pending })).toMatchObject({
      paypalInvoiceId: null,
      status: "PENDING",
    });
  });

  it.each([
    { ...capture, amount: { currencyCode: "USD", value: 100 } },
    { ...capture, createTime: "not-a-timestamp" },
    { ...capture, sellerReceivableBreakdown: { grossAmount: capture.amount, paypalFee: {} } },
  ])("rejects malformed capture fields without exposing their values", (result) => {
    expect(() => toCaptureRecord(result)).toThrow(/^Invalid capture$/);
  });
});

const refund: Refund = {
  id: "REFUND123",
  status: RefundStatus.Completed,
  invoiceId: "INV2-TEST",
  amount: { currencyCode: "USD", value: "40.00" },
  sellerPayableBreakdown: {
    grossAmount: { currencyCode: "USD", value: "40.00" },
    paypalFee: { currencyCode: "USD", value: "1.76" },
    netAmount: { currencyCode: "USD", value: "38.24" },
  },
  links: [{ rel: "up", href: "https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE123" }],
  createTime: "2026-10-27T12:00:00Z",
};

describe("toRefundRecord", () => {
  it("copies the breakdown and links the refunded capture", () => {
    expect(toRefundRecord(refund)).toEqual({
      refundId: "REFUND123",
      status: "COMPLETED",
      captureId: "CAPTURE123",
      paypalInvoiceId: "INV2-TEST",
      gross: "40.00",
      fee: "1.76",
      net: "38.24",
      currency: "USD",
      createTime: "2026-10-27T12:00:00Z",
    });
  });

  it("uses amount without a breakdown and keeps absent fields null", () => {
    const { sellerPayableBreakdown, links, invoiceId, ...minimal } = refund;
    expect(toRefundRecord(minimal)).toMatchObject({
      gross: "40.00",
      currency: "USD",
      fee: null,
      net: null,
      captureId: null,
      paypalInvoiceId: null,
    });
  });

  it("prefers grossAmount and accepts it without amount", () => {
    const { amount, ...withoutAmount } = refund;
    expect(toRefundRecord(withoutAmount).gross).toBe("40.00");
    expect(
      toRefundRecord({ ...refund, amount: { currencyCode: "USD", value: "41.00" } }).gross,
    ).toBe("40.00");
  });

  it("does not treat a different up-link resource as a capture", () => {
    expect(
      toRefundRecord({
        ...refund,
        links: [{ rel: "up", href: "https://api-m.sandbox.paypal.com/v2/payments/refunds/OTHER" }],
      }).captureId,
    ).toBeNull();
  });

  it.each([
    { ...refund, amount: undefined, sellerPayableBreakdown: undefined },
    { ...refund, amount: { currencyCode: "USD", value: 40 } },
    { ...refund, status: "UNKNOWN" },
    { ...refund, createTime: "private invalid timestamp" },
    { ...refund, sellerPayableBreakdown: { paypalFee: {} } },
    { ...refund, links: [{ rel: "up", href: "private invalid link" }] },
  ])("rejects malformed refunds without exposing values", (input) => {
    expect(() => toRefundRecord(input)).toThrow(/^Invalid refund$/);
  });
});

function sdkResponse(result: Refund): ApiResponse<Refund> {
  return {
    result,
    statusCode: 200,
    headers: {},
    body: "",
    request: {
      method: "GET",
      url: "https://api-m.sandbox.paypal.com/v2/payments/refunds/REFUND123",
    },
  };
}

function sdkError(statusCode: number, result?: unknown) {
  const response = sdkResponse({});
  const error = new ApiError<unknown>(
    {
      request: response.request,
      response: { statusCode, headers: {}, body: "private PayPal response" },
    },
    "private SDK error",
  );
  error.result = result;
  return error;
}

describe("ledger refunds", () => {
  const input = {
    captureId: "CAPTURE123",
    amount: { value: "40.00", currency: "USD" },
    noteToPayer: "Refund for invoice NIR/2026-27/1",
  };
  const ledger = createPayPalLedger({ clientId: "dummy-id", clientSecret: "dummy-secret" });

  beforeEach(() => {
    vi.spyOn(PaymentsController.prototype, "getRefund").mockRejectedValue(
      new Error("Unexpected refund read"),
    );
    vi.spyOn(PaymentsController.prototype, "refundCapturedPayment").mockRejectedValue(
      new Error("Unexpected refund request"),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("reads and maps a refund through the SDK", async () => {
    vi.mocked(PaymentsController.prototype.getRefund).mockResolvedValue(sdkResponse(refund));
    await expect(ledger.getRefund("REFUND123")).resolves.toEqual(toRefundRecord(refund));
    expect(PaymentsController.prototype.getRefund).toHaveBeenCalledExactlyOnceWith({
      refundId: "REFUND123",
    });
  });

  it("returns null only on a 404 refund read", async () => {
    vi.mocked(PaymentsController.prototype.getRefund).mockRejectedValue(sdkError(404));
    await expect(ledger.getRefund("MISSING")).resolves.toBeNull();
  });

  it.each([RefundStatus.Completed, RefundStatus.Pending])(
    "sends the exact refund request (%s)",
    async (status) => {
      vi.mocked(PaymentsController.prototype.refundCapturedPayment).mockResolvedValue(
        sdkResponse({ id: "REFUND123", status }),
      );
      await expect(ledger.refundCapture(input, "ACTION-refund")).resolves.toEqual({
        refundId: "REFUND123",
        status,
      });
      expect(PaymentsController.prototype.refundCapturedPayment).toHaveBeenCalledExactlyOnceWith({
        captureId: "CAPTURE123",
        paypalRequestId: "ACTION-refund",
        prefer: "return=minimal",
        body: { amount: { currencyCode: "USD", value: "40.00" }, noteToPayer: input.noteToPayer },
      });
    },
  );

  it.each([
    {
      error: sdkError(422, { name: "UNPROCESSABLE_ENTITY", message: "private details" }),
      status: 422,
      code: "UNPROCESSABLE_ENTITY",
    },
    { error: sdkError(500), status: 500, code: "LEDGER_REQUEST_FAILED" },
    {
      error: sdkError(403, { name: "private error value" }),
      status: 403,
      code: "LEDGER_REQUEST_FAILED",
    },
    { error: new Error("private transport details"), status: 0, code: "LEDGER_REQUEST_FAILED" },
  ])("sanitizes refund read and write errors ($status, $code)", async ({ error, status, code }) => {
    vi.mocked(PaymentsController.prototype.getRefund).mockRejectedValue(error);
    vi.mocked(PaymentsController.prototype.refundCapturedPayment).mockRejectedValue(error);
    for (const action of [
      ledger.getRefund("REFUND123"),
      ledger.refundCapture(input, "ACTION-refund"),
    ]) {
      await expect(action).rejects.toEqual(new PayPalApiError(status, code));
    }
  });

  it("rejects invalid input before calling the SDK", async () => {
    await expect(ledger.getRefund("")).rejects.toThrow(/^Invalid refundId$/);
    await expect(ledger.refundCapture(input, "")).rejects.toThrow(/^Invalid refund request$/);
    await expect(ledger.refundCapture({ ...input, captureId: "" }, "ID")).rejects.toThrow(
      /^Invalid refund request$/,
    );
    await expect(
      ledger.refundCapture({ ...input, amount: { value: "40.001", currency: "USD" } }, "ID"),
    ).rejects.toThrow(/^Invalid refund request$/);
    expect(PaymentsController.prototype.getRefund).not.toHaveBeenCalled();
    expect(PaymentsController.prototype.refundCapturedPayment).not.toHaveBeenCalled();
  });

  it("rejects incomplete SDK responses", async () => {
    vi.mocked(PaymentsController.prototype.getRefund).mockResolvedValue(
      sdkResponse({ id: "REFUND123" }),
    );
    vi.mocked(PaymentsController.prototype.refundCapturedPayment).mockResolvedValue(
      sdkResponse({ status: RefundStatus.Pending }),
    );
    await expect(ledger.getRefund("REFUND123")).rejects.toThrow(/^Invalid refund$/);
    await expect(ledger.refundCapture(input, "ID")).rejects.toThrow(/^Invalid refund$/);
  });
});
