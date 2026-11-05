import { caDashboardSchema } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import {
  CA_DASHBOARD_PROMPT_STARTERS,
  caDashboardInitialState,
  caDashboardSources,
} from "./ca-dashboard";

const freelancerId = "20000000-0000-4000-8000-000000000001";
const invoice = {
  freelancerId,
  freelancerName: "Synthetic freelancer",
  invoiceId: "10000000-0000-4000-8000-000000000001",
  number: "2026-27/0001",
  date: "2026-09-30",
  financialYear: "2026-27",
  clientName: "Synthetic buyer",
  status: "sent",
  currency: "USD",
  amount: "100.00",
  received: "0.00",
  shortfall: "100.00",
  deadline: "2027-06-30",
  daysRemaining: 241,
  overdue: false,
  firaStatus: "missing",
};
const dashboard = caDashboardSchema.parse({
  asOf: "2026-11-05",
  financialYear: "2026-27",
  portfolio: [
    {
      linkId: "30000000-0000-4000-8000-000000000001",
      freelancerId,
      name: "Synthetic freelancer",
      email: "private@example.test",
      sharedSince: "2026-11-01T00:00:00.000Z",
      healthScore: 80,
      unpaidCount: 1,
      overdueCount: 0,
      nextDeadline: { date: "2027-06-30", title: "RBI deadline" },
      firaMissingCount: 1,
      pendingApprovals: 2,
    },
  ],
  invoices: [invoice],
  payments: [
    {
      freelancerId,
      freelancerName: "Synthetic freelancer",
      paymentId: "40000000-0000-4000-8000-000000000001",
      kind: "payment",
      date: "2026-10-01",
      month: "2026-10",
      financialYear: "2026-27",
      invoiceNumber: "2026-27/0001",
      clientName: "Synthetic buyer",
      currency: "USD",
      gross: "100.00",
      signedGross: "100.00",
      fee: "4.40",
      net: "95.60",
      paypalFxRate: null,
    },
  ],
});

const firstInvoice = dashboard.invoices[0];
const firstClient = dashboard.portfolio[0];
if (!firstInvoice || !firstClient) throw new Error("Expected dashboard fixtures");

function fieldReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fieldReferences);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "id" && typeof child === "string" && child.includes(".")
      ? [child]
      : fieldReferences(child),
  );
}

describe("CA portfolio sources and widgets", () => {
  const sourcesOf = (input = dashboard) =>
    caDashboardSources(input).sources.flatMap((source) =>
      "fields" in source && "data" in source ? [source] : [],
    );
  const sources = sourcesOf();
  const state = caDashboardInitialState(dashboard.financialYear);
  const [page] = state.pages ?? [];

  it("places all five widgets and references only existing fields", () => {
    expect(Object.keys(page?.widgets ?? {}).sort()).toEqual([
      "clients",
      "fees",
      "fira",
      "received",
      "unpaid",
    ]);
    expect(Object.keys(page?.widgetLayout ?? {}).sort()).toEqual(
      Object.keys(page?.widgets ?? {}).sort(),
    );
    const known = new Set(
      sources.flatMap((source) => (source.fields ?? []).map((field) => `${source.id}.${field.id}`)),
    );
    const references = fieldReferences(state);
    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((id) => !known.has(id))).toEqual([]);
    for (const source of sources) {
      const fields = (source.fields ?? []).map((field) => field.id).sort();
      for (const row of source.data ?? []) expect(Object.keys(row).sort()).toEqual(fields);
    }
  });

  it("rejects malformed ledger tags and numeric money at the dashboard boundary", () => {
    for (const change of [
      { freelancerId: "not-an-id" },
      { freelancerName: null },
      { amount: 100 },
    ]) {
      expect(
        caDashboardSchema.safeParse({ ...dashboard, invoices: [{ ...firstInvoice, ...change }] })
          .success,
      ).toBe(false);
    }
  });

  it("keeps owner emails out of sources and uses existing display conversions", () => {
    expect(JSON.stringify(sources)).not.toMatch(/email|private@example|citation|address/i);
    expect(sources.find((source) => source.id === "payments")?.data).toMatchObject([
      {
        freelancerId,
        freelancerName: "Synthetic freelancer",
        fee: 4.4,
        gross: 100,
        inrAtPaypalRate: null,
      },
    ]);
    expect(sources.find((source) => source.id === "clients")?.data).toMatchObject([
      {
        healthScore: 80,
        pendingApprovals: 2,
        firaMissingCount: 1,
        nextDeadline: new Date("2027-06-30T00:00:00"),
      },
    ]);
    const unnamed = sourcesOf({
      ...dashboard,
      portfolio: [{ ...firstClient, name: null }],
    });
    expect(JSON.stringify(unnamed)).not.toContain("private@example");
    expect(unnamed.find((source) => source.id === "clients")?.data).toMatchObject([
      { freelancerName: "Unnamed freelancer" },
    ]);
  });

  it("filters current-FY payment fees and keeps currencies and same-name freelancers separate", () => {
    expect(page?.filter?.widget?.fees).toEqual([
      { field: { id: "payments.kind" }, model: { operator: "isIn", value: ["payment"] } },
      { field: { id: "payments.financialYear" }, model: { operator: "isIn", value: ["2026-27"] } },
    ]);
    expect(page?.filter?.widget?.received).toEqual([
      { field: { id: "payments.kind" }, model: { operator: "isIn", value: ["payment"] } },
    ]);
    expect(page?.widgets?.fees).toMatchObject({
      dataMapping: {
        categoryKey: [{ id: "payments.freelancerId" }],
        legendKey: [{ id: "payments.currency" }],
      },
    });
    expect(page?.widgets?.received).toMatchObject({
      type: "column-chart-stacked",
      dataMapping: {
        categoryKey: [{ id: "payments.monthCurrency" }],
        legendKey: [{ id: "payments.freelancerId" }],
      },
    });
    expect(caDashboardInitialState("2027-28").pages?.[0]?.filter?.widget?.fees).toContainEqual({
      field: { id: "payments.financialYear" },
      model: { operator: "isIn", value: ["2027-28"] },
    });
  });

  it("keeps only the ten nearest unpaid deadlines, retaining all invoices for questions", () => {
    const invoices = Array.from({ length: 12 }, (_, index) => ({
      ...firstInvoice,
      invoiceId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      number: `Invoice ${index}`,
      deadline: `2027-06-${String(index + 1).padStart(2, "0")}`,
    })).reverse();
    const output = sourcesOf({
      ...dashboard,
      invoices: [
        ...invoices,
        { ...firstInvoice, shortfall: "0.00", deadline: "2027-01-01" },
        { ...firstInvoice, deadline: null },
      ],
    });
    expect(output.find((source) => source.id === "invoices")?.data).toHaveLength(14);
    const nearest = output.find((source) => source.id === "unpaid")?.data ?? [];
    expect(nearest).toHaveLength(10);
    expect(nearest.map((row) => row.number)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Invoice ${index}`),
    );
  });

  it("accepts empty sources and exposes the three requested prompt starters", () => {
    expect(
      sourcesOf({ ...dashboard, portfolio: [], invoices: [], payments: [] }).every(
        (source) => source.data?.length === 0,
      ),
    ).toBe(true);
    expect(CA_DASHBOARD_PROMPT_STARTERS.map(({ prompt }) => prompt)).toEqual([
      "Which clients have missing FIRAs?",
      "Who has invoices closest to the RBI deadline?",
      "Show PayPal fees by freelancer this year",
    ]);
  });

  it("formats freelancer IDs as names without using names as grouping keys, and separates month currencies", () => {
    const secondId = "20000000-0000-4000-8000-000000000002";
    const payment = dashboard.payments[0];
    if (!payment) throw new Error("Expected payment fixture");
    const output = sourcesOf({
      ...dashboard,
      portfolio: [firstClient, { ...firstClient, freelancerId: secondId }],
      payments: [payment, { ...payment, freelancerId: secondId, currency: "EUR" }],
    });
    const payments = output.find((source) => source.id === "payments");
    expect(payments?.data).toMatchObject([
      { freelancerId, monthCurrency: "2026-10 USD" },
      { freelancerId: secondId, monthCurrency: "2026-10 EUR" },
    ]);
    const field = payments?.fields?.find((field) => field.id === "freelancerId");
    expect(field?.createValueFormatter).toBeTypeOf("function");
  });
});
