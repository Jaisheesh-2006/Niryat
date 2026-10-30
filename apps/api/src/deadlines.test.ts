import { realisationDeadline } from "@niryat/rules";
import { type Invoice, invoiceViewSchema } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { toInvoiceView } from "./compliance";
import { rules } from "./rules";

const invoice: Invoice = {
  id: "10000000-0000-4000-8000-000000000001",
  clientId: "20000000-0000-4000-8000-000000000001",
  clientName: "Synthetic client",
  type: "one_time",
  number: "2026-27/0001",
  fy: "2026-27",
  date: "2026-10-26",
  currency: "USD",
  amount: "100.00",
  description: "Software development",
  sac: "998314",
  recurrence: null,
  status: "sent",
  pdfUrl: null,
  paypalInvoiceId: "INV2-TEST",
  paypalRecurringSeriesId: null,
  paidTotal: "0.00",
  payments: [],
  firaStatus: "pending",
  refundedTotal: "0.00",
  refunds: [],
  disputes: [],
  action: null,
  refundActions: [],
};

describe("invoice deadlines", () => {
  it.each<{
    status: Invoice["status"];
    paidTotal: string;
    refundedTotal: string;
    hasDeadline: boolean;
  }>([
    { status: "issued", paidTotal: "0.00", refundedTotal: "0.00", hasDeadline: true },
    { status: "sent", paidTotal: "0.00", refundedTotal: "0.00", hasDeadline: true },
    { status: "partially_paid", paidTotal: "40.00", refundedTotal: "0.00", hasDeadline: true },
    { status: "paid", paidTotal: "100.00", refundedTotal: "0.00", hasDeadline: false },
    {
      status: "partially_refunded",
      paidTotal: "100.00",
      refundedTotal: "40.00",
      hasDeadline: true,
    },
    { status: "refunded", paidTotal: "100.00", refundedTotal: "100.00", hasDeadline: true },
  ])("uses the shortfall for $status", ({ hasDeadline, ...values }) => {
    const today = "2027-06-01";
    const view = toInvoiceView({ ...invoice, ...values }, null, today);
    expect(view.compliance.deadline).toEqual(
      hasDeadline ? realisationDeadline({ invoice, today }, rules) : null,
    );
    expect(invoiceViewSchema.parse(view)).toEqual(view);
  });

  it("retains a deadline for a one-paise shortfall", () => {
    const view = toInvoiceView(
      { ...invoice, status: "partially_paid", paidTotal: "99.99" },
      false,
      "2027-07-27",
    );
    expect(view.compliance.realisation.shortfall).toBe("0.01");
    expect(view.compliance.deadline).toMatchObject({ daysRemaining: -1, overdue: true });
    expect(invoiceViewSchema.parse(view)).toEqual(view);
  });
});
