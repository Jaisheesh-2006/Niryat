import type { Dashboard } from "@niryat/shared";
import type { AgDataSourcesDefinition, AgReportState } from "ag-studio";
import { type NiryatRegistry, RUNWAY_WIDGET_TYPE } from "./runway";

export const DASHBOARD_EMPTY =
  "No PayPal payments or invoices yet. Widgets fill in after your first invoice.";

// shortcut: AG Studio aggregates JavaScript numbers; display only, never a compliance figure (D3).
const amount = (value: string | null) => (value === null ? null : Number(value));
const day = (value: string | null) => (value === null ? null : new Date(`${value}T00:00:00`));

export function dashboardSources(dashboard: Dashboard): AgDataSourcesDefinition<NiryatRegistry> {
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
          { id: "gross", name: "Amount before fees", format: "decimalFormat" },
          { id: "signedGross", name: "Income (refunds negative)", format: "decimalFormat" },
          { id: "fee", name: "PayPal fee", format: "decimalFormat" },
          { id: "net", name: "Amount after fees", format: "decimalFormat" },
          { id: "paypalFxRate", name: "PayPal exchange rate", format: "decimalFormat" },
          { id: "inrAtPaypalRate", name: "INR at PayPal rate", format: "decimalFormat" },
          { id: "fxRateStatus", name: "Exchange rate", format: "textFormat" },
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
          { id: "firaStatus", name: "Payment proof status", format: "textFormat" },
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
    // Payments and disputes join their invoice, so the Client filter and the AI can work across sources.
    relationships: ["payments", "disputes"].map((tableId) => ({
      id: `${tableId}-invoice`,
      source: { tableId, fieldId: "invoiceNumber" },
      target: { tableId: "invoices", fieldId: "number" },
      type: "many-to-one" as const,
    })),
    // Display ratio only (D3). Refunds carry no fee, so the base counts payments alone.
    expressions: [
      {
        id: "feeBase",
        name: "Payment amount before fees (payments only)",
        hide: true,
        isMeasure: false,
        expression: {
          operator: "if",
          inputs: [
            {
              operator: "equals",
              inputs: [{ id: "payments.kind" }, { type: "string", value: "payment" }],
            },
            { id: "payments.gross" },
            { type: "number", value: null },
          ],
        },
      },
      {
        id: "effectiveFeeRate",
        name: "Effective PayPal fee rate",
        description:
          "PayPal fees as a share of payments received, refunds excluded. Group by currency; never compare a rate across mixed currencies.",
        format: "percentageFormat",
        formatOptions: { format: "#,##0.0%" },
        isMeasure: true,
        expression: {
          operator: "divide",
          inputs: [
            { id: "payments.fee", aggregation: "sum" },
            { id: "feeBase", aggregation: "sum" },
          ],
        },
      },
    ],
  };
}

const title = (text: string) => ({ title: { enabled: true, text } });
// Clicking a bar or row filters every other widget; Studio leaves this off unless set.
export const crossFiltered = (text: string) => ({ ...title(text), crossFilter: "filter" as const });
const byMonthAndCurrency = (value: string) => ({
  categoryKey: [{ id: "payments.month" }],
  valueKey: [{ id: value, aggregation: "sum" as const }],
  legendKey: [{ id: "payments.currency" }],
  tooltipKey: [],
});
const kindIs = (kind: "payment" | "refund") => [
  { field: { id: "payments.kind" }, model: { operator: "isIn" as const, value: [kind] } },
];

const unpaidOnly = [
  { field: { id: "invoices.shortfall" }, model: { operator: "greaterThan" as const, value: 0 } },
];

// Open edit panels squeeze the widget canvas to nothing; only the AI Assistant starts open.
export const DASHBOARD_PANELS: NonNullable<AgReportState["panels"]> = {
  filters: { collapsed: true },
  edit: { collapsed: true },
  data: { collapsed: true },
};

export const dashboardInitialState: AgReportState<NiryatRegistry> = {
  panels: DASHBOARD_PANELS,
  pages: [
    {
      id: "overview",
      widgets: {
        client: {
          type: "button-filter",
          dataMapping: { value: [{ id: "invoices.clientName" }] },
          // The filter labels itself ("Filter by: Client"); a widget title would clip its buttons.
          format: {},
        },
        // On invoice date: payments and disputes follow through their invoice, and unpaid invoices stay visible.
        dates: {
          type: "date-filter",
          dataMapping: { value: [{ id: "invoices.date" }] },
          format: { style: { filterType: "between" } },
        },
        income: {
          type: "column-chart-grouped",
          dataMapping: byMonthAndCurrency("payments.signedGross"),
          format: crossFiltered("Income by month and currency"),
        },
        fees: {
          type: "column-chart-grouped",
          dataMapping: byMonthAndCurrency("payments.fee"),
          format: crossFiltered("PayPal fees by month and currency"),
        },
        feeRate: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "payments.currency" },
              { id: "payments.gross", aggregation: "sum" },
              { id: "payments.fee", aggregation: "sum" },
              { id: "effectiveFeeRate" },
            ],
          },
          format: crossFiltered("Effective PayPal fee rate by currency"),
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
          format: crossFiltered("FX: payments with and without a PayPal rate"),
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
          format: crossFiltered("Refunds"),
        },
        disputes: {
          type: "column-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "disputes.status" }],
            valueKey: [{ id: "disputes.amount", aggregation: "count" }],
            tooltipKey: [],
          },
          format: crossFiltered("Disputes by status"),
        },
        // The health source joins nothing, so it neither sends nor receives cross-filters.
        health: {
          type: "radial-gauge",
          dataMapping: { value: [{ id: "health.score", aggregation: "sum" }] },
          format: {
            ...title("Health score"),
            style: { scaleLabel: { enabled: true, min: 0, max: 100 } },
          },
        },
        fira: {
          type: "column-chart-grouped",
          dataMapping: {
            categoryKey: [{ id: "invoices.firaStatus" }],
            valueKey: [{ id: "invoices.amount", aggregation: "count" }],
            tooltipKey: [],
          },
          format: crossFiltered("Invoices by payment proof status"),
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
          format: crossFiltered("Unpaid invoices by RBI deadline"),
        },
        // Niryat's custom widget (RunwayWidget.tsx); it titles itself and has no format.
        runway: {
          type: RUNWAY_WIDGET_TYPE,
          dataMapping: {
            label: [{ id: "invoices.number" }],
            days: [{ id: "invoices.daysRemaining" }],
            link: [{ id: "invoices.invoiceId" }],
          },
        },
      },
      widgetLayout: {
        client: { xTrack: 0, yTrack: 0, xSpan: 16, ySpan: 8 },
        dates: { xTrack: 16, yTrack: 0, xSpan: 8, ySpan: 8 },
        income: { xTrack: 0, yTrack: 8, xSpan: 12, ySpan: 12 },
        fees: { xTrack: 12, yTrack: 8, xSpan: 12, ySpan: 12 },
        health: { xTrack: 0, yTrack: 20, xSpan: 8, ySpan: 12 },
        fira: { xTrack: 8, yTrack: 20, xSpan: 8, ySpan: 12 },
        disputes: { xTrack: 16, yTrack: 20, xSpan: 8, ySpan: 12 },
        unpaid: { xTrack: 0, yTrack: 32, xSpan: 14, ySpan: 12 },
        runway: { xTrack: 14, yTrack: 32, xSpan: 10, ySpan: 12 },
        feeRate: { xTrack: 0, yTrack: 44, xSpan: 12, ySpan: 12 },
        fx: { xTrack: 12, yTrack: 44, xSpan: 12, ySpan: 12 },
        refunds: { xTrack: 0, yTrack: 56, xSpan: 24, ySpan: 12 },
      },
      filter: {
        widget: {
          fees: kindIs("payment"),
          feeRate: kindIs("payment"),
          fx: kindIs("payment"),
          refunds: kindIs("refund"),
          unpaid: unpaidOnly,
          runway: unpaidOnly,
        },
      },
    },
  ],
  selectedPageId: "overview",
};
