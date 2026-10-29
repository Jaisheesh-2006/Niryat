import { expect, it, vi } from "vitest";
import {
  buildInvoiceRequest,
  buildSendRequest,
  buildSeriesRequest,
  getInvoiceRefundIds,
  PayPalApiError,
  type PayPalRestClient,
} from "../index";

function refundReader(reply: unknown) {
  const read = vi.fn<(path: string) => Promise<unknown>>().mockResolvedValue(reply);
  const rest: Pick<PayPalRestClient, "get"> = {
    async get(path, parse) {
      return parse(await read(path));
    },
  };
  return { read, rest };
}

it("reads invoice refund IDs from observed and documented fields, deduping PayPal refunds only", async () => {
  const { rest, read } = refundReader({
    id: "INV2-TEST",
    refunds: {
      transactions: [
        { type: "PAYPAL", recipient_transaction_id: "REFUND-1" },
        { type: "PAYPAL", refund_id: "REFUND-2" },
        { type: "PAYPAL", recipient_transaction_id: "REFUND-1" },
        { type: "EXTERNAL", refund_id: "EXTR-1" },
      ],
    },
  });
  expect(await getInvoiceRefundIds(rest, "INV2-TEST")).toEqual(["REFUND-1", "REFUND-2"]);
  expect(read).toHaveBeenCalledExactlyOnceWith("/v2/invoicing/invoices/INV2-TEST");
});

it("ignores invoices marked refunded externally without a PayPal money movement", async () => {
  const { rest } = refundReader({
    id: "INV2-TEST",
    refunds: { transactions: [{ type: "EXTERNAL" }] },
  });
  expect(await getInvoiceRefundIds(rest, "INV2-TEST")).toEqual([]);
});

it.each([
  { id: "INV2-OTHER", refunds: { transactions: [{ type: "EXTERNAL" }] } },
  { id: "INV2-TEST" },
  { id: "INV2-TEST", refunds: { transactions: [] } },
  { id: "INV2-TEST", refunds: { transactions: [{ type: "PAYPAL" }] } },
  {
    id: "INV2-TEST",
    refunds: { transactions: [{ type: "PAYPAL", recipient_transaction_id: 42 }] },
  },
  { id: "INV2-TEST", refunds: { transactions: [{ type: "PAYPAL", refund_id: "../private" }] } },
  { id: "INV2-TEST", refunds: { transactions: [{ type: "OTHER", refund_id: "REFUND-1" }] } },
])("rejects malformed invoice refund data without exposing values", async (reply) => {
  const { rest } = refundReader(reply);
  await expect(getInvoiceRefundIds(rest, "INV2-TEST")).rejects.toThrow(/^Invalid invoice refunds$/);
});

it("rejects unsafe invoice IDs before transport and preserves PayPal read failures for retries", async () => {
  const { rest, read } = refundReader(undefined);
  await expect(getInvoiceRefundIds(rest, "../private")).rejects.toThrow(/^Invalid invoiceId$/);
  expect(read).not.toHaveBeenCalled();
  const error = new PayPalApiError(503, "SERVICE_UNAVAILABLE");
  read.mockRejectedValue(error);
  await expect(getInvoiceRefundIds(rest, "INV2-TEST")).rejects.toBe(error);
});

const invoice = {
  legalName: "Ananya Rao",
  clientName: "Acme Inc",
  clientEmail: "buyer@example.com",
  number: "2026-27/0001",
  date: "2026-10-26",
  currency: "USD",
  amount: "1500.00",
  description: "Software development",
  note: "GST invoice PDF: https://example.com/api/files/test",
};

it("builds the invoice with GSTIN and supplied terms without changing its input", () => {
  const input = Object.freeze({
    ...invoice,
    gstin: "27ABCDE1234F1Z5",
    terms: "LUT terms supplied by rules",
  });
  expect(buildInvoiceRequest(input)).toMatchInlineSnapshot(`
    {
      "detail": {
        "currency_code": "USD",
        "invoice_date": "2026-10-26",
        "invoice_number": "2026-27/0001",
        "note": "GST invoice PDF: https://example.com/api/files/test",
        "payment_term": {
          "term_type": "DUE_ON_RECEIPT",
        },
        "terms_and_conditions": "LUT terms supplied by rules",
      },
      "invoicer": {
        "business_name": "Ananya Rao",
        "tax_id": "27ABCDE1234F1Z5",
      },
      "items": [
        {
          "name": "Software development",
          "quantity": "1",
          "unit_amount": {
            "currency_code": "USD",
            "value": "1500.00",
          },
        },
      ],
      "primary_recipients": [
        {
          "billing_info": {
            "business_name": "Acme Inc",
            "email_address": "buyer@example.com",
          },
        },
      ],
    }
  `);
});

it("omits GSTIN and terms for an unregistered supplier", () => {
  const body = buildInvoiceRequest(invoice);
  expect(body).not.toHaveProperty("invoicer.tax_id");
  expect(body).not.toHaveProperty("detail.terms_and_conditions");
  expect(buildInvoiceRequest({ ...invoice, gstin: null })).toEqual(body);
});

it("sends only to the recipient with the supplied subject", () => {
  expect(
    buildSendRequest({ subject: "Invoice 2026-27/0001 from Ananya Rao" }),
  ).toMatchInlineSnapshot(`
    {
      "send_to_invoicer": false,
      "send_to_recipient": true,
      "subject": "Invoice 2026-27/0001 from Ananya Rao",
    }
  `);
});

it("builds a recurring series without an invoice number or invoice date", () => {
  const body = buildSeriesRequest({
    ...invoice,
    gstin: "27ABCDE1234F1Z5",
    terms: "LUT terms supplied by rules",
    recurrence: { intervalUnit: "MONTH", intervalCount: 1, totalCycles: 2 },
  });
  expect(body).toMatchInlineSnapshot(`
    {
      "plan_detail": {
        "frequency": {
          "interval_count": 1,
          "interval_unit": "MONTH",
        },
        "start_series_date": "2026-10-26",
        "total_cycles": 2,
      },
      "recurring_info": {
        "detail": {
          "currency_code": "USD",
          "note": "GST invoice PDF: https://example.com/api/files/test",
          "payment_term": {
            "term_type": "DUE_ON_RECEIPT",
          },
          "terms_and_conditions": "LUT terms supplied by rules",
        },
        "invoicer": {
          "business_name": "Ananya Rao",
          "tax_id": "27ABCDE1234F1Z5",
        },
        "items": [
          {
            "name": "Software development",
            "quantity": "1",
            "unit_amount": {
              "currency_code": "USD",
              "value": "1500.00",
            },
          },
        ],
        "primary_recipients": [
          {
            "billing_info": {
              "business_name": "Acme Inc",
              "email_address": "buyer@example.com",
            },
          },
        ],
      },
    }
  `);
  expect(body).not.toHaveProperty("recurring_info.detail.invoice_number");
  expect(body).not.toHaveProperty("recurring_info.detail.invoice_date");
  expect(JSON.stringify(body)).not.toContain("invoice_number");
});
