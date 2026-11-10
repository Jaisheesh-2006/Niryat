import type { CaDashboard } from "@niryat/shared";
import type { AgDataSourcesDefinition, AgReportState } from "ag-studio";
import { crossFiltered, DASHBOARD_PANELS, dashboardSources } from "./dashboard";
import type { NiryatRegistry } from "./runway";

export const CA_DASHBOARD_PROMPT_STARTERS = [
  "Which clients are missing payment proof?",
  "Who has invoices closest to the RBI deadline?",
  "Show PayPal fees by freelancer this year",
].map((prompt) => ({ label: prompt, prompt }));

export function caDashboardSources(
  dashboard: CaDashboard,
): AgDataSourcesDefinition<NiryatRegistry> {
  const names = new Map(
    dashboard.portfolio.map((row) => [row.freelancerId, row.name ?? "Unnamed freelancer"]),
  );
  const freelancerField = {
    id: "freelancerId",
    name: "Freelancer",
    format: "textFormat" as const,
    createValueFormatter: () => (id: string) => names.get(id) ?? id,
  };
  const ledger = {
    ...dashboard,
    health: null,
    disputes: [],
    payments: dashboard.payments.map((row) => ({
      ...row,
      monthCurrency: `${row.month} ${row.currency}`,
    })),
  };
  const base = dashboardSources(ledger);
  const sources = base.sources.filter((source) => ["payments", "invoices"].includes(source.id));
  const unpaid = dashboardSources({
    ...ledger,
    payments: [],
    invoices: dashboard.invoices
      .filter((row) => Number(row.shortfall) > 0 && row.deadline !== null)
      .sort(
        (a, b) =>
          (a.deadline ?? "").localeCompare(b.deadline ?? "") ||
          a.invoiceId.localeCompare(b.invoiceId),
      )
      .slice(0, 10),
  }).sources.find((source) => source.id === "invoices");
  return {
    sources: [
      {
        id: "clients",
        name: "Freelancer clients",
        fields: [
          freelancerField,
          { id: "freelancerName", name: "Freelancer name", format: "textFormat" },
          { id: "healthScore", name: "Health score", format: "integerFormat" },
          { id: "unpaidCount", name: "Unpaid invoices", format: "integerFormat" },
          { id: "overdueCount", name: "Overdue invoices", format: "integerFormat" },
          { id: "firaMissingCount", name: "Missing payment proof", format: "integerFormat" },
          { id: "nextDeadline", name: "Next deadline", format: "dateFormat" },
          { id: "pendingApprovals", name: "Approvals waiting", format: "integerFormat" },
        ],
        data: dashboard.portfolio.map((row) => ({
          freelancerId: row.freelancerId,
          freelancerName: row.name ?? "Unnamed freelancer",
          healthScore: row.healthScore,
          unpaidCount: row.unpaidCount,
          overdueCount: row.overdueCount,
          firaMissingCount: row.firaMissingCount,
          nextDeadline: row.nextDeadline ? new Date(`${row.nextDeadline.date}T00:00:00`) : null,
          pendingApprovals: row.pendingApprovals,
        })),
      },
      ...[
        ...sources,
        ...(unpaid ? [{ ...unpaid, id: "unpaid", name: "Nearest unpaid invoices (top 10)" }] : []),
      ].map((source) =>
        "fields" in source
          ? {
              ...source,
              fields: [
                ...(source.fields ?? []),
                freelancerField,
                { id: "freelancerName", name: "Freelancer name", format: "textFormat" as const },
                ...(source.id === "payments"
                  ? [
                      {
                        id: "monthCurrency",
                        name: "Month and currency",
                        format: "textFormat" as const,
                      },
                    ]
                  : []),
              ],
            }
          : source,
      ),
    ],
    // One client row per freelancer; the Freelancer filter and the AI reach every source through it.
    relationships: ["payments", "invoices", "unpaid"].map((tableId) => ({
      id: `${tableId}-freelancer`,
      source: { tableId: "clients", fieldId: "freelancerId" },
      target: { tableId, fieldId: "freelancerId" },
      type: "one-to-many" as const,
    })),
    // The fee-rate expressions read only payments fields, which the CA payments source keeps.
    ...(base.expressions ? { expressions: base.expressions } : {}),
  };
}

export function caDashboardInitialState(financialYear: string): AgReportState {
  const currentYearPayments = [
    { field: { id: "payments.kind" }, model: { operator: "isIn" as const, value: ["payment"] } },
    {
      field: { id: "payments.financialYear" },
      model: { operator: "isIn" as const, value: [financialYear] },
    },
  ];
  return {
    panels: DASHBOARD_PANELS,
    pages: [
      {
        id: "portfolio",
        widgets: {
          freelancer: {
            type: "button-filter",
            dataMapping: { value: [{ id: "clients.freelancerId" }] },
            format: {},
          },
          clients: {
            type: "grid",
            dataMapping: {
              cols: [
                "freelancerId",
                "healthScore",
                "unpaidCount",
                "overdueCount",
                "firaMissingCount",
                "nextDeadline",
                "pendingApprovals",
              ].map((field) => ({ id: `clients.${field}` })),
            },
            // AG Studio rejects a grid sort with more than one field.
            sort: [{ field: { id: "clients.overdueCount" }, direction: "desc" }],
            format: crossFiltered("Clients"),
          },
          fees: {
            type: "bar-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "payments.freelancerId" }],
              valueKey: [{ id: "payments.fee", aggregation: "sum" }],
              legendKey: [{ id: "payments.currency" }],
              tooltipKey: [],
            },
            format: crossFiltered(`PayPal fees by freelancer and currency (${financialYear})`),
          },
          received: {
            type: "column-chart-stacked",
            dataMapping: {
              categoryKey: [{ id: "payments.monthCurrency" }],
              valueKey: [{ id: "payments.gross", aggregation: "sum" }],
              legendKey: [{ id: "payments.freelancerId" }],
              tooltipKey: [],
            },
            sort: [{ field: { id: "payments.monthCurrency" }, direction: "asc" }],
            format: crossFiltered("Received per month by freelancer and currency"),
          },
          unpaid: {
            type: "grid",
            dataMapping: {
              cols: [
                "freelancerName",
                "invoiceId",
                "number",
                "currency",
                "deadline",
                "daysRemaining",
                "shortfall",
              ].map((field) => ({ id: `unpaid.${field}` })),
            },
            sort: [{ field: { id: "unpaid.deadline" }, direction: "asc" }],
            format: crossFiltered("Unpaid invoices nearest to their RBI deadline (top 10)"),
          },
          fira: {
            type: "bar-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "clients.freelancerId" }],
              valueKey: [{ id: "clients.firaMissingCount", aggregation: "sum" }],
              tooltipKey: [],
            },
            format: crossFiltered("Missing payment proof by freelancer"),
          },
          // Currencies are pivot columns with no total column, so different currencies are never added together.
          pivot: {
            type: "pivot-grid",
            dataMapping: {
              rows: [{ id: "payments.freelancerId" }, { id: "payments.month" }],
              columns: [{ id: "payments.currency" }],
              values: [
                { id: "payments.gross", aggregation: "sum" },
                { id: "payments.fee", aggregation: "sum" },
                { id: "effectiveFeeRate" },
              ],
            },
            format: {
              ...crossFiltered(
                `Payments, fees and fee rate by freelancer and month (${financialYear})`,
              ),
              style: { totalColumns: false },
            },
          },
        },
        widgetLayout: {
          freelancer: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 8 },
          clients: { xTrack: 0, yTrack: 8, xSpan: 24, ySpan: 12 },
          fees: { xTrack: 0, yTrack: 20, xSpan: 12, ySpan: 12 },
          received: { xTrack: 12, yTrack: 20, xSpan: 12, ySpan: 12 },
          unpaid: { xTrack: 0, yTrack: 32, xSpan: 24, ySpan: 12 },
          fira: { xTrack: 0, yTrack: 44, xSpan: 24, ySpan: 12 },
          pivot: { xTrack: 0, yTrack: 56, xSpan: 24, ySpan: 14 },
        },
        filter: {
          widget: {
            fees: currentYearPayments,
            pivot: currentYearPayments,
            received: [
              { field: { id: "payments.kind" }, model: { operator: "isIn", value: ["payment"] } },
            ],
          },
        },
      },
    ],
    selectedPageId: "portfolio",
  };
}
