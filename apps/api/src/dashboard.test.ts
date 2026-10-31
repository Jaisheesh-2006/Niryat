import { dashboardSchema, type HealthReport, type Invoice } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { toInvoiceView } from "./compliance";
import { buildDashboard } from "./dashboard";

const today = "2026-10-31";
const invoice: Invoice = {
  id: "10000000-0000-4000-8000-000000000001",
  clientId: "20000000-0000-4000-8000-000000000001",
  clientName: "Synthetic client",
  type: "one_time",
  number: "2025-26/0001",
  fy: "2025-26",
  date: "2026-03-20",
  currency: "USD",
  amount: "100.00",
  description: "Software",
  sac: "998314",
  recurrence: null,
  status: "partially_refunded",
  pdfUrl: null,
  paypalInvoiceId: null,
  paypalRecurringSeriesId: null,
  paidTotal: "100.00",
  payments: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      paypalTxnId: "CAPTURE-1",
      gross: "100.00",
      fee: "4.40",
      net: "95.60",
      currency: "USD",
      fxRate: "84.1234",
      // 20:00 UTC on 31 March is 1 April in India: a new month and financial year.
      receivedAt: "2026-03-31T20:00:00Z",
      fira: null,
    },
  ],
  firaStatus: "pending",
  refundedTotal: "10.00",
  refunds: [
    {
      id: "30000000-0000-4000-8000-000000000002",
      paypalTxnId: "REFUND-1",
      captureId: "CAPTURE-1",
      gross: "10.00",
      fee: "0.40",
      net: "9.60",
      currency: "USD",
      receivedAt: "2026-05-02T00:00:00Z",
    },
  ],
  disputes: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      paypalDisputeId: "DISPUTE-1",
      amount: "10.00",
      currency: "USD",
      reason: "OTHER",
      status: "OPEN",
      stage: null,
      outcome: null,
      responseDueDate: "2026-11-05",
    },
  ],
  action: null,
  refundActions: [],
};
const health: HealthReport = { score: 80, flags: [], suggestion: null, checkedOn: today };

describe("dashboard rows", () => {
  const view = toInvoiceView(invoice, true, today);
  const dashboard = dashboardSchema.parse(buildDashboard({ views: [view], health }, today));

  it("signs refunds negative and dates payments by their IST month and financial year", () => {
    expect(dashboard.asOf).toBe(today);
    expect(dashboard.health).toEqual(health);
    expect(dashboard.payments).toEqual([
      {
        paymentId: "30000000-0000-4000-8000-000000000001",
        kind: "payment",
        date: "2026-04-01",
        month: "2026-04",
        financialYear: "2026-27",
        invoiceNumber: "2025-26/0001",
        clientName: "Synthetic client",
        currency: "USD",
        gross: "100.00",
        signedGross: "100.00",
        fee: "4.40",
        net: "95.60",
        paypalFxRate: "84.1234",
      },
      {
        paymentId: "30000000-0000-4000-8000-000000000002",
        kind: "refund",
        date: "2026-05-02",
        month: "2026-05",
        financialYear: "2026-27",
        invoiceNumber: "2025-26/0001",
        clientName: "Synthetic client",
        currency: "USD",
        gross: "10.00",
        signedGross: "-10.00",
        fee: "0.40",
        net: "9.60",
        paypalFxRate: null,
      },
    ]);
  });

  it("takes invoice realisation and deadline figures from the compliance view", () => {
    expect(dashboard.invoices).toEqual([
      {
        invoiceId: invoice.id,
        number: "2025-26/0001",
        date: "2026-03-20",
        financialYear: "2025-26",
        clientName: "Synthetic client",
        status: "partially_refunded",
        currency: "USD",
        amount: "100.00",
        received: view.compliance.realisation.received,
        shortfall: view.compliance.realisation.shortfall,
        deadline: view.compliance.deadline?.deadline ?? null,
        daysRemaining: view.compliance.deadline?.daysRemaining ?? null,
        overdue: view.compliance.deadline?.overdue ?? false,
        firaStatus: "pending",
      },
    ]);
    expect(dashboard.disputes).toEqual([
      {
        paypalDisputeId: "DISPUTE-1",
        invoiceNumber: "2025-26/0001",
        clientName: "Synthetic client",
        status: "OPEN",
        reason: "OTHER",
        currency: "USD",
        amount: "10.00",
        responseDueDate: "2026-11-05",
      },
    ]);
  });

  it("carries an unpaid invoice's RBI deadline", () => {
    const unpaid = toInvoiceView(
      {
        ...invoice,
        status: "sent",
        paidTotal: "0.00",
        payments: [],
        refundedTotal: "0.00",
        refunds: [],
      },
      true,
      today,
    );
    const [row] = buildDashboard({ views: [unpaid], health: null }, today).invoices;
    expect(row?.shortfall).toBe("100.00");
    expect(row?.deadline).toBe(unpaid.compliance.deadline?.deadline);
    expect(row?.deadline).not.toBeNull();
  });

  it("holds no email or address fields and returns empty sources without invoices", () => {
    expect(JSON.stringify(dashboard)).not.toMatch(/email|address/i);
    expect(buildDashboard({ views: [], health: null }, today)).toEqual({
      asOf: today,
      health: null,
      payments: [],
      invoices: [],
      disputes: [],
    });
  });
});
