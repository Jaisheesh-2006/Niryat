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

export interface PayPalLedger {
  getCapture(captureId: string): Promise<CaptureRecord | null>;
  searchTransactions(range: { start: string; end: string }): Promise<LedgerRow[]>;
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
