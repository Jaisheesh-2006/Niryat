import { dashboardSchema } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { dashboardInitialState, dashboardSources } from "./dashboard";

const dashboard = dashboardSchema.parse({
  asOf: "2026-11-01",
  health: {
    score: 80,
    flags: [
      {
        code: "lut_expiring",
        severity: "medium",
        message: "Synthetic flag",
        citation: { ruleId: "LUT_REQUIRED", source: "Synthetic source", effectiveFrom: null },
        note: "Verify with your CA.",
      },
    ],
    suggestion: null,
    checkedOn: "2026-11-01",
  },
  payments: [
    {
      paymentId: "30000000-0000-4000-8000-000000000001",
      kind: "payment",
      date: "2026-10-01",
      month: "2026-10",
      financialYear: "2026-27",
      invoiceNumber: "2026-27/0001",
      clientName: "Synthetic client",
      currency: "USD",
      gross: "100.00",
      signedGross: "100.00",
      fee: "4.40",
      net: "95.60",
      paypalFxRate: "84.10",
    },
    {
      paymentId: "30000000-0000-4000-8000-000000000002",
      kind: "refund",
      date: "2026-10-02",
      month: "2026-10",
      financialYear: "2026-27",
      invoiceNumber: "2026-27/0001",
      clientName: "Synthetic client",
      currency: "USD",
      gross: "10.00",
      signedGross: "-10.00",
      fee: null,
      net: null,
      paypalFxRate: null,
    },
  ],
  invoices: [
    {
      invoiceId: "10000000-0000-4000-8000-000000000001",
      number: "2026-27/0001",
      date: "2026-09-30",
      financialYear: "2026-27",
      clientName: "Synthetic client",
      status: "partially_refunded",
      currency: "USD",
      amount: "100.00",
      received: "90.00",
      shortfall: "10.00",
      deadline: "2027-06-30",
      daysRemaining: 241,
      overdue: false,
      firaStatus: "pending",
    },
  ],
  disputes: [
    {
      paypalDisputeId: "DISPUTE-1",
      invoiceNumber: "2026-27/0001",
      clientName: "Synthetic client",
      status: "OPEN",
      reason: "OTHER",
      currency: "USD",
      amount: "10.00",
      responseDueDate: null,
    },
  ],
});

function fieldReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fieldReferences);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "id" && typeof child === "string" && child.includes(".")
      ? [child]
      : fieldReferences(child),
  );
}

describe("dashboard sources and widgets", () => {
  const sourcesOf = (input: typeof dashboard) =>
    dashboardSources(input).sources.flatMap((s) => ("fields" in s && "data" in s ? [s] : []));
  const sources = sourcesOf(dashboard);
  const [page] = dashboardInitialState.pages ?? [];

  it("builds the seven required widgets (refunds and disputes as two tiles), all placed", () => {
    expect(Object.keys(page?.widgets ?? {}).sort()).toEqual(
      ["disputes", "fees", "fira", "fx", "health", "income", "refunds", "unpaid"].sort(),
    );
    expect(Object.keys(page?.widgetLayout ?? {}).sort()).toEqual(
      Object.keys(page?.widgets ?? {}).sort(),
    );
  });

  it("references only fields that exist in a source", () => {
    const known = new Set(sources.flatMap((s) => (s.fields ?? []).map((f) => `${s.id}.${f.id}`)));
    expect(sources.map((s) => s.id)).toEqual(["payments", "invoices", "disputes", "health"]);
    const references = fieldReferences(dashboardInitialState);
    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((id) => !known.has(id))).toEqual([]);
  });

  it("declares every row key as a field", () => {
    for (const source of sources) {
      const fields = (source.fields ?? []).map((field) => field.id).sort();
      for (const row of source.data ?? []) expect(Object.keys(row).sort()).toEqual(fields);
    }
  });

  it("converts money for display, keeps refunds negative and counts missing PayPal rates", () => {
    const payments = sources.find((source) => source.id === "payments")?.data ?? [];
    expect(payments).toMatchObject([
      {
        signedGross: 100,
        fee: 4.4,
        inrAtPaypalRate: 8410,
        fxRateStatus: "PayPal rate provided",
        date: new Date("2026-10-01T00:00:00"),
      },
      { signedGross: -10, inrAtPaypalRate: null, fxRateStatus: "Rate not provided by PayPal" },
    ]);
  });

  it("passes health figures only, never flag messages or citations", () => {
    const health = sources.find((source) => source.id === "health")?.data;
    expect(health).toEqual([{ score: 80, openFlags: 1 }]);
    expect(sourcesOf({ ...dashboard, health: null }).at(-1)?.data).toEqual([]);
  });
});
