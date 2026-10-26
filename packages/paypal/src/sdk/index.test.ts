import {
  type CapturedPayment,
  CaptureStatus,
  Client,
  Environment,
  type OAuthToken,
  PaymentsController,
} from "@paypal/paypal-server-sdk";
import { describe, expect, it, vi } from "vitest";
import { toCaptureRecord } from "../index";
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
