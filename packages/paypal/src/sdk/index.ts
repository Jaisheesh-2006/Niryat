import {
  ApiError,
  Client,
  Environment,
  type OAuthToken,
  PaymentsController,
  TransactionSearchController,
} from "@paypal/paypal-server-sdk";
import { z } from "zod";
import { PayPalApiError } from "../rest/index";

export interface CaptureRecord {
  captureId: string;
  status: string;
  paypalInvoiceId: string | null;
  gross: string;
  fee: string | null;
  net: string | null;
  currency: string;
  fxRate: string | null;
  createTime: string;
}

export interface LedgerRow {
  transactionId: string;
  eventCode: string;
}

export interface RefundRecord {
  refundId: string;
  status: string;
  captureId: string | null;
  paypalInvoiceId: string | null;
  gross: string;
  fee: string | null;
  net: string | null;
  currency: string;
  createTime: string;
}

export interface PayPalLedger {
  getCapture(captureId: string): Promise<CaptureRecord | null>;
  searchTransactions(range: { start: string; end: string }): Promise<LedgerRow[]>;
  getRefund(refundId: string): Promise<RefundRecord | null>;
  refundCapture(
    input: { captureId: string; amount: { value: string; currency: string }; noteToPayer: string },
    requestId: string,
  ): Promise<{ refundId: string; status: string }>;
}

const decimalSchema = z.string().regex(/^\d+(\.\d+)?$/);
const moneySchema = z.object({
  value: decimalSchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
});
const captureSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  invoiceId: z.string().min(1).optional(),
  amount: moneySchema,
  sellerReceivableBreakdown: z
    .object({
      grossAmount: moneySchema,
      paypalFee: moneySchema.optional(),
      netAmount: moneySchema.optional(),
      exchangeRate: z.object({ value: decimalSchema }).optional(),
    })
    .optional(),
  createTime: z.iso.datetime({ offset: true }),
});
const refundResultSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["CANCELLED", "FAILED", "PENDING", "COMPLETED"]),
});
const refundMoneySchema = moneySchema.extend({ value: z.string().regex(/^\d+(\.\d{1,2})?$/) });
const refundSchema = refundResultSchema.extend({
  invoiceId: z.string().min(1).optional(),
  amount: refundMoneySchema.optional(),
  sellerPayableBreakdown: z
    .object({
      grossAmount: refundMoneySchema.optional(),
      paypalFee: refundMoneySchema.optional(),
      netAmount: refundMoneySchema.optional(),
    })
    .optional(),
  links: z.array(z.object({ href: z.url(), rel: z.string().min(1) })).optional(),
  createTime: z.iso.datetime({ offset: true }),
});
const ledgerErrorSchema = z.object({
  name: z
    .string()
    .max(100)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/),
});
const searchSchema = z.object({
  transactionDetails: z
    .array(
      z.object({
        transactionInfo: z.object({
          transactionId: z.string().min(1),
          transactionEventCode: z.string().min(1),
        }),
      }),
    )
    .default([]),
  totalPages: z.number().int().nonnegative(),
});

export function toCaptureRecord(result: unknown): CaptureRecord {
  const parsed = captureSchema.safeParse(result);
  if (!parsed.success) throw new Error("Invalid capture");
  const capture = parsed.data;
  const breakdown = capture.sellerReceivableBreakdown;
  const gross = breakdown?.grossAmount ?? capture.amount;
  return {
    captureId: capture.id,
    status: capture.status,
    paypalInvoiceId: capture.invoiceId ?? null,
    gross: gross.value,
    fee: breakdown?.paypalFee?.value ?? null,
    net: breakdown?.netAmount?.value ?? null,
    currency: gross.currencyCode,
    fxRate: breakdown?.exchangeRate?.value ?? null,
    createTime: capture.createTime,
  };
}

export function toRefundRecord(result: unknown): RefundRecord {
  const parsed = refundSchema.safeParse(result);
  if (!parsed.success) throw new Error("Invalid refund");
  const refund = parsed.data;
  const breakdown = refund.sellerPayableBreakdown;
  const gross = breakdown?.grossAmount ?? refund.amount;
  if (!gross) throw new Error("Invalid refund");
  const up = refund.links?.find((link) => link.rel === "up");
  const captureId = up
    ? new URL(up.href).pathname.match(/^\/v2\/payments\/captures\/([A-Za-z0-9-]+)$/)?.[1]
    : undefined;
  return {
    refundId: refund.id,
    status: refund.status,
    captureId: captureId ?? null,
    paypalInvoiceId: refund.invoiceId ?? null,
    gross: gross.value,
    fee: breakdown?.paypalFee?.value ?? null,
    net: breakdown?.netAmount?.value ?? null,
    currency: gross.currencyCode,
    createTime: refund.createTime,
  };
}

export async function ledgerTokenProvider(
  _lastToken: OAuthToken | undefined,
  authManager: { fetchToken(): Promise<OAuthToken> },
): Promise<OAuthToken> {
  try {
    return await authManager.fetchToken();
  } catch {
    // The SDK caches rejected token promises; an expired token lets the next request retry.
    return { accessToken: "", tokenType: "Bearer", expiry: 0n };
  }
}

export function createPayPalLedger(options: {
  clientId: string;
  clientSecret: string;
}): PayPalLedger {
  const credentials = z
    .object({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
    .safeParse(options);
  if (!credentials.success) throw new Error("Invalid PayPal configuration: clientId, clientSecret");
  const client = new Client({
    environment: Environment.Sandbox,
    timeout: 30_000,
    clientCredentialsAuthCredentials: {
      oAuthClientId: credentials.data.clientId,
      oAuthClientSecret: credentials.data.clientSecret,
      oAuthTokenProvider: ledgerTokenProvider,
    },
  });
  const payments = new PaymentsController(client);
  const transactions = new TransactionSearchController(client);

  return {
    async getRefund(refundId) {
      if (!z.string().min(1).safeParse(refundId).success) throw new Error("Invalid refundId");
      let result: unknown;
      try {
        result = (await payments.getRefund({ refundId })).result;
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) return null;
        const parsed = ledgerErrorSchema.safeParse(error instanceof ApiError ? error.result : null);
        throw new PayPalApiError(
          error instanceof ApiError ? error.statusCode : 0,
          parsed.success ? parsed.data.name : "LEDGER_REQUEST_FAILED",
        );
      }
      return toRefundRecord(result);
    },
    async refundCapture(input, requestId) {
      const parsed = z
        .object({
          captureId: z.string().min(1),
          amount: z.object({
            value: refundMoneySchema.shape.value,
            currency: moneySchema.shape.currencyCode,
          }),
          noteToPayer: z.string().min(1),
          requestId: z.string().min(1),
        })
        .safeParse({ ...input, requestId });
      if (!parsed.success) throw new Error("Invalid refund request");
      const data = parsed.data;
      let result: unknown;
      try {
        result = (
          await payments.refundCapturedPayment({
            captureId: data.captureId,
            paypalRequestId: data.requestId,
            prefer: "return=minimal",
            body: {
              amount: { currencyCode: data.amount.currency, value: data.amount.value },
              noteToPayer: data.noteToPayer,
            },
          })
        ).result;
      } catch (error) {
        const parsed = ledgerErrorSchema.safeParse(error instanceof ApiError ? error.result : null);
        throw new PayPalApiError(
          error instanceof ApiError ? error.statusCode : 0,
          parsed.success ? parsed.data.name : "LEDGER_REQUEST_FAILED",
        );
      }
      const refund = refundResultSchema.safeParse(result);
      if (!refund.success) throw new Error("Invalid refund");
      return { refundId: refund.data.id, status: refund.data.status };
    },
    async getCapture(captureId) {
      if (!z.string().min(1).safeParse(captureId).success) throw new Error("Invalid captureId");
      let result: unknown;
      try {
        result = (await payments.getCapturedPayment({ captureId })).result;
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) return null;
        throw new PayPalApiError(
          error instanceof ApiError ? error.statusCode : 0,
          "LEDGER_REQUEST_FAILED",
        );
      }
      return toCaptureRecord(result);
    },
    async searchTransactions(range) {
      const input = z
        .object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
        .safeParse(range);
      if (!input.success) throw new Error("Invalid transaction range: start, end");
      const rows: LedgerRow[] = [];
      for (let page = 1; ; page++) {
        let result: unknown;
        try {
          result = (
            await transactions.searchTransactions({
              startDate: input.data.start,
              endDate: input.data.end,
              fields: "transaction_info",
              pageSize: 100,
              page,
            })
          ).result;
        } catch (error) {
          throw new PayPalApiError(
            error instanceof ApiError ? error.statusCode : 0,
            "LEDGER_REQUEST_FAILED",
          );
        }
        const parsed = searchSchema.safeParse(result);
        if (!parsed.success) throw new Error("Invalid transaction search");
        for (const { transactionInfo } of parsed.data.transactionDetails) {
          rows.push({
            transactionId: transactionInfo.transactionId,
            eventCode: transactionInfo.transactionEventCode,
          });
        }
        if (page >= parsed.data.totalPages) return rows;
      }
    },
  };
}
