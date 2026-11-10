import { dashboardSchema } from "@niryat/shared";
import { type AgDataSourcesDefinition, createDataEngine } from "ag-studio";
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

// Every `id` below widgets, filters or expressions is a field reference (source or expression field).
function fieldReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(fieldReferences);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "id" && typeof child === "string" ? [child] : fieldReferences(child),
  );
}

describe("dashboard sources and widgets", () => {
  const sourcesOf = (input: typeof dashboard) =>
    dashboardSources(input).sources.flatMap((s) => ("fields" in s && "data" in s ? [s] : []));
  const sources = sourcesOf(dashboard);
  const [page] = dashboardInitialState.pages ?? [];
  const expressions = dashboardSources(dashboard).expressions ?? [];

  it("builds the seven required widgets (refunds and disputes as two tiles), the fee rate and two filters, all placed", () => {
    expect(Object.keys(page?.widgets ?? {}).sort()).toEqual(
      [
        "client",
        "dates",
        "disputes",
        "feeRate",
        "fees",
        "fira",
        "fx",
        "health",
        "income",
        "refunds",
        "runway",
        "unpaid",
      ].sort(),
    );
    expect(Object.keys(page?.widgetLayout ?? {}).sort()).toEqual(
      Object.keys(page?.widgets ?? {}).sort(),
    );
  });

  it("references only fields that exist in a source or an expression", () => {
    const known = new Set(sources.flatMap((s) => (s.fields ?? []).map((f) => `${s.id}.${f.id}`)));
    // Relationships carry the client filter from invoices to payments and disputes.
    for (const relation of dashboardSources(dashboard).relationships ?? [])
      for (const end of [relation.source, relation.target])
        expect(known).toContain("fieldId" in end ? `${end.tableId}.${end.fieldId}` : "calendar");
    expect(sources.map((s) => s.id)).toEqual(["payments", "invoices", "disputes", "health"]);
    for (const expression of expressions) known.add(expression.id);
    const references = fieldReferences([
      page?.widgets,
      page?.filter,
      expressions.map((e) => e.expression),
    ]);
    expect(references).toContain("effectiveFeeRate");
    expect(references.filter((id) => !known.has(id))).toEqual([]);
  });

  it("computes the PayPal fee rate per currency in AG Studio's engine, leaving refunds out", async () => {
    const [payment] = dashboard.payments;
    if (!payment) throw new Error("Expected payment fixture");
    // The registries differ only in widgets, which the data engine never reads.
    const engine = createDataEngine(
      dashboardSources({
        ...dashboard,
        payments: [
          ...dashboard.payments,
          { ...payment, paymentId: "eur", currency: "EUR", gross: "200.00", fee: "7.00" },
        ],
      }) as unknown as AgDataSourcesDefinition,
    ) as ReturnType<typeof createDataEngine> & { finalize(): void };
    // shortcut: finalize() is engine-internal (Studio calls it on mount); recheck on an ag-studio upgrade.
    engine.finalize();
    const [result] = await engine.execute({
      query: {
        axes: [
          {
            dimensions: [
              {
                field: {
                  key: "payments.currency",
                  sourceId: "payments",
                  fieldId: "payments.currency",
                },
              },
            ],
          },
        ],
        measures: [
          { field: { key: "effectiveFeeRate", sourceId: "", fieldId: "effectiveFeeRate" } },
        ],
      },
    });
    const rows = result && "rows" in result ? result.rows : [];
    // USD: 4.40 / 100 (the 10.00 refund is excluded); EUR: 7.00 / 200.
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { "payments.currency": "USD", effectiveFeeRate: expect.closeTo(0.044, 10) },
        { "payments.currency": "EUR", effectiveFeeRate: expect.closeTo(0.035, 10) },
      ]),
    );
  });

  it("cross-filters every chart and grid on the related sources; filters, the unrelated health gauge and the format-less runway (which asks in getData) are excluded", () => {
    for (const [id, widget] of Object.entries(page?.widgets ?? {})) {
      const crossFilter = widget && "format" in widget ? widget.format?.crossFilter : undefined;
      expect([id, crossFilter]).toEqual([
        id,
        ["client", "dates", "health", "runway"].includes(id) ? undefined : "filter",
      ]);
    }
    expect(page?.widgets?.health).toMatchObject({
      type: "radial-gauge",
      format: { style: { scaleLabel: { min: 0, max: 100 } } },
    });
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
