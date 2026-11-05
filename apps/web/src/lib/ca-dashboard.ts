import type { CaDashboard } from "@niryat/shared";
import type { AgDataSourcesDefinition, AgReportState } from "ag-studio";
import { dashboardSources } from "./dashboard";

export const CA_DASHBOARD_PROMPT_STARTERS = [
  "Which clients are missing payment proof?",
  "Who has invoices closest to the RBI deadline?",
  "Show PayPal fees by freelancer this year",
].map((prompt) => ({ label: prompt, prompt }));

export function caDashboardSources(dashboard: CaDashboard): AgDataSourcesDefinition {
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
  const sources = dashboardSources(ledger).sources.filter((source) =>
    ["payments", "invoices"].includes(source.id),
  );
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
  };
}

const title = (text: string) => ({ title: { enabled: true, text } });

export function caDashboardInitialState(financialYear: string): AgReportState {
  return {
    pages: [
      {
        id: "portfolio",
        widgets: {
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
            sort: [
              { field: { id: "clients.overdueCount" }, direction: "desc" },
              { field: { id: "clients.nextDeadline" }, direction: "asc" },
            ],
            format: title("Clients"),
          },
          fees: {
            type: "bar-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "payments.freelancerId" }],
              valueKey: [{ id: "payments.fee", aggregation: "sum" }],
              legendKey: [{ id: "payments.currency" }],
              tooltipKey: [],
            },
            format: title(`PayPal fees by freelancer and currency (${financialYear})`),
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
            format: title("Received per month by freelancer and currency"),
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
            format: title("Unpaid invoices nearest to their RBI deadline (top 10)"),
          },
          fira: {
            type: "bar-chart-grouped",
            dataMapping: {
              categoryKey: [{ id: "clients.freelancerId" }],
              valueKey: [{ id: "clients.firaMissingCount", aggregation: "sum" }],
              tooltipKey: [],
            },
            format: title("Missing payment proof by freelancer"),
          },
        },
        widgetLayout: {
          clients: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 12 },
          fees: { xTrack: 0, yTrack: 12, xSpan: 12, ySpan: 12 },
          received: { xTrack: 12, yTrack: 12, xSpan: 12, ySpan: 12 },
          unpaid: { xTrack: 0, yTrack: 24, xSpan: 24, ySpan: 12 },
          fira: { xTrack: 0, yTrack: 36, xSpan: 24, ySpan: 12 },
        },
        filter: {
          widget: {
            fees: [
              { field: { id: "payments.kind" }, model: { operator: "isIn", value: ["payment"] } },
              {
                field: { id: "payments.financialYear" },
                model: { operator: "isIn", value: [financialYear] },
              },
            ],
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
