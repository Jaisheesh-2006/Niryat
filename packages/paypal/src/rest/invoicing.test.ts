import { expect, it } from "vitest";
import { buildInvoiceRequest, buildSendRequest, buildSeriesRequest } from "../index";

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
