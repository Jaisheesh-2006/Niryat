import type { Dashboard } from "@niryat/shared";
import type { AgDataSourcesDefinition, AgReportState } from "ag-studio";

export const DASHBOARD_EMPTY =
  "No PayPal payments or invoices yet. Widgets fill in after your first invoice.";

// shortcut: AG Studio aggregates JavaScript numbers; display only, never a compliance figure (D3).
const amount = (value: string | null) => (value === null ? null : Number(value));
const day = (value: string | null) => (value === null ? null : new Date(`${value}T00:00:00`));

export function dashboardSources(dashboard: Dashboard): AgDataSourcesDefinition {
  return {
    sources: [
      {
        id: "payments",
        name: "PayPal payments and refunds",
        fields: [
          { id: "paymentId", name: "Payment ID", format: "textFormat" },
          { id: "kind", name: "Kind", format: "textFormat" },
          { id: "date", name: "Date", format: "dateFormat" },
          { id: "month", name: "Month", format: "textFormat" },
          { id: "financialYear", name: "Financial year", format: "textFormat" },
          { id: "invoiceNumber", name: "Invoice", format: "textFormat" },
          { id: "clientName", name: "Client", format: "textFormat" },
          { id: "currency", name: "Currency", format: "textFormat" },
          { id: "gross", name: "Gross", format: "decimalFormat" },
          { id: "signedGross", name: "Income (refunds negative)", format: "decimalFormat" },
          { id: "fee", name: "PayPal fee", format: "decimalFormat" },
          { id: "net", name: "Net", format: "decimalFormat" },
          { id: "paypalFxRate", name: "PayPal FX rate", format: "decimalFormat" },
          { id: "inrAtPaypalRate", name: "INR at PayPal rate", format: "decimalFormat" },
          { id: "fxRateStatus", name: "FX rate", format: "textFormat" },
        ],
        data: dashboard.payments.map((row) => ({
          ...row,
          date: day(row.date),
          gross: amount(row.gross),
          signedGross: amount(row.signedGross),
          fee: amount(row.fee),
          net: amount(row.net),
          paypalFxRate: amount(row.paypalFxRate),
          inrAtPaypalRate:
            row.paypalFxRate === null ? null : Number(row.gross) * Number(row.paypalFxRate),
          fxRateStatus:
            row.paypalFxRate === null ? "Rate not provided by PayPal" : "PayPal rate provided",
        })),
      },
      {
        id: "invoices",
        name: "Invoices",
        fields: [
          { id: "invoiceId", name: "Invoice ID", format: "textFormat" },
          { id: "number", name: "Invoice", format: "textFormat" },
          { id: "date", name: "Invoice date", format: "dateFormat" },
          { id: "financialYear", name: "Financial year", format: "textFormat" },
          { id: "clientName", name: "Client", format: "textFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "currency", name: "Currency", format: "textFormat" },
          { id: "amount", name: "Amount", format: "decimalFormat" },
          { id: "received", name: "Received", format: "decimalFormat" },
          { id: "shortfall", name: "Unpaid", format: "decimalFormat" },
          { id: "deadline", name: "RBI deadline", format: "dateFormat" },
          { id: "daysRemaining", name: "Days to RBI deadline", format: "integerFormat" },
          { id: "overdue", name: "Overdue", format: "textFormat" },
          { id: "firaStatus", name: "FIRA status", format: "textFormat" },
        ],
        data: dashboard.invoices.map((row) => ({
          ...row,
          date: day(row.date),
          amount: amount(row.amount),
          received: amount(row.received),
          shortfall: amount(row.shortfall),
          deadline: day(row.deadline),
          overdue: row.overdue ? "Yes" : "No",
        })),
      },
      {
        id: "disputes",
        name: "PayPal disputes",
        fields: [
          { id: "paypalDisputeId", name: "Dispute", format: "textFormat" },
          { id: "invoiceNumber", name: "Invoice", format: "textFormat" },
          { id: "clientName", name: "Client", format: "textFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "reason", name: "Reason", format: "textFormat" },
          { id: "currency", name: "Currency", format: "textFormat" },
          { id: "amount", name: "Amount", format: "decimalFormat" },
          { id: "responseDueDate", name: "Response due", format: "dateFormat" },
        ],
        data: dashboard.disputes.map((row) => ({
          ...row,
          amount: amount(row.amount),
          responseDueDate: day(row.responseDueDate),
        })),
      },
      {
        id: "health",
        name: "Health check",
        fields: [
          { id: "score", name: "Health score", format: "integerFormat" },
          { id: "openFlags", name: "Open flags", format: "integerFormat" },
        ],
        // Figures only: flag messages and citations stay on the health-check page.
        data: dashboard.health
          ? [{ score: dashboard.health.score, openFlags: dashboard.health.flags.length }]
          : [],
      },
    ],
  };
}

const title = (text: string) => ({ title: { enabled: true, text } });
const byMonthAndCurrency = (value: string) => ({
  categoryKey: [{ id: "payments.month" }],
  valueKey: [{ id: value, aggregation: "sum" as const }],
  legendKey: [{ id: "payments.currency" }],
  tooltipKey: [],
});
const kindIs = (kind: "payment" | "refund") => [
  { field: { id: "payments.kind" }, model: { operator: "isIn" as const, value: [kind] } },
];

export const dashboardInitialState: AgReportState = {
  pages: [
    {
      id: "overview",
      widgets: {
        income: {
          type: "column-chart-grouped",
          dataMapping: byMonthAndCurrency("payments.signedGross"),
          format: title("Income by month and currency"),
        },
        fees: {
          type: "column-chart-grouped",
          dataMapping: byMonthAndCurrency("payments.fee"),
          format: title("PayPal fees by month and currency"),
        },
        fx: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "payments.fxRateStatus" },
              { id: "payments.currency" },
              { id: "payments.gross", aggregation: "count" },
              { id: "payments.gross", aggregation: "sum" },
              { id: "payments.inrAtPaypalRate", aggregation: "sum" },
            ],
          },
          format: title("FX: payments with and without a PayPal rate"),
        },
        refunds: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "payments.date" },
              { id: "payments.invoiceNumber" },
              { id: "payments.clientName" },
              { id: "payments.currency" },
              { id: "payments.gross", aggregation: "sum" },
            ],
          },
          format: title("Refunds"),
        },
        disputes: {
          type: "column-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "disputes.status" }],
            valueKey: [{ id: "disputes.amount", aggregation: "count" }],
            tooltipKey: [],
          },
          format: title("Disputes by status"),
        },
        health: {
          type: "value",
          dataMapping: { value: [{ id: "health.score", aggregation: "sum" }] },
          format: title("Health score"),
        },
        fira: {
          type: "column-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "invoices.firaStatus" }],
            valueKey: [{ id: "invoices.amount", aggregation: "count" }],
            tooltipKey: [],
          },
          format: title("Invoices by FIRA status"),
        },
        unpaid: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "invoices.number" },
              { id: "invoices.clientName" },
              { id: "invoices.currency" },
              { id: "invoices.deadline" },
              { id: "invoices.daysRemaining" },
              { id: "invoices.shortfall", aggregation: "sum" },
            ],
          },
          sort: [{ field: { id: "invoices.daysRemaining" }, direction: "asc" }],
          format: title("Unpaid invoices by RBI deadline"),
        },
      },
      widgetLayout: {
        income: { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 12 },
        fees: { xTrack: 12, yTrack: 0, xSpan: 12, ySpan: 12 },
        health: { xTrack: 0, yTrack: 12, xSpan: 8, ySpan: 12 },
        fira: { xTrack: 8, yTrack: 12, xSpan: 8, ySpan: 12 },
        disputes: { xTrack: 16, yTrack: 12, xSpan: 8, ySpan: 12 },
        unpaid: { xTrack: 0, yTrack: 24, xSpan: 24, ySpan: 12 },
        fx: { xTrack: 0, yTrack: 36, xSpan: 12, ySpan: 12 },
        refunds: { xTrack: 12, yTrack: 36, xSpan: 12, ySpan: 12 },
      },
      filter: {
        widget: {
          fees: kindIs("payment"),
          fx: kindIs("payment"),
          refunds: kindIs("refund"),
          unpaid: [
            { field: { id: "invoices.shortfall" }, model: { operator: "greaterThan", value: 0 } },
          ],
        },
      },
    },
  ],
  selectedPageId: "overview",
};
