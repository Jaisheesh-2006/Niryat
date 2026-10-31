import { advanceTaxDates, gstr1Period, gstr1PeriodsDueBetween } from "@niryat/rules";
import { calendarEventSchema, type Invoice, type InvoiceView } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { buildCalendarEvents } from "./calendar";
import { toInvoiceView } from "./compliance";
import { rules } from "./rules";

const today = "2026-10-31";
const profile = {
  gstRegistered: true,
  lutValidTo: "2027-03-31",
  gstr1Frequency: "monthly",
} as const;
const invoice: Invoice = {
  id: "10000000-0000-4000-8000-000000000001",
  clientId: "20000000-0000-4000-8000-000000000001",
  clientName: "Synthetic client",
  type: "recurring",
  number: "2025-26/0001",
  fy: "2025-26",
  date: "2026-01-31",
  currency: "USD",
  amount: "100.00",
  description: "Software",
  sac: "998314",
  recurrence: { intervalUnit: "MONTH", intervalCount: 1, totalCycles: 12 },
  status: "sent",
  pdfUrl: null,
  paypalInvoiceId: null,
  paypalRecurringSeriesId: null,
  paidTotal: "0.00",
  payments: [],
  firaStatus: "pending",
  refundedTotal: "10.00",
  refunds: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      paypalTxnId: "REFUND-1",
      captureId: null,
      gross: "10.00",
      fee: null,
      net: null,
      currency: "USD",
      receivedAt: "2026-02-01T00:00:00Z",
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
      responseDueDate: "2026-10-30",
    },
  ],
  action: null,
  refundActions: [],
};
const view = toInvoiceView(invoice, true, today);

function events(views: readonly InvoiceView[] = [view], asOf = today) {
  return buildCalendarEvents({ profile, views }, asOf, rules);
}

describe("calendar events", () => {
  it("returns every kind with exact IDs, titles, links and rules", () => {
    const href = `/invoices#invoice-${invoice.id}`;
    const result = events();
    const expected = [
      {
        id: "lut:2027-03-31",
        date: "2027-03-31",
        kind: "lut_renewal",
        title: "Upcoming: LUT expires",
        state: "upcoming",
        href: "/profile",
        ruleId: "LUT_REQUIRED",
      },
      {
        id: "gstr1:2026-10",
        date: "2026-11-11",
        kind: "gstr1_due",
        title: "Upcoming: GSTR-1 due for October 2026",
        state: "upcoming",
        href: "/gstr1?period=2026-10",
        ruleId: "GSTR1_6A",
      },
      {
        id: "advance-tax:2026-12-15",
        date: "2026-12-15",
        kind: "advance_tax",
        title: "Upcoming: Advance tax: 75% of the year's tax due",
        state: "upcoming",
        href: "/advance-tax?taxYear=2026-27",
        ruleId: "ADVANCE_TAX_DATES",
      },
      {
        id: "advance-tax:2027-03-15",
        date: "2027-03-15",
        kind: "advance_tax",
        title: "Upcoming: Advance tax: 100% due (presumptive filers pay it all by this date)",
        state: "upcoming",
        href: "/advance-tax?taxYear=2026-27",
        ruleId: "ADVANCE_TAX_DATES",
      },
      {
        id: `rbi:${invoice.id}`,
        date: "2026-10-31",
        kind: "rbi_deadline",
        title: `Upcoming: RBI deadline for invoice ${invoice.number}`,
        state: "upcoming",
        href,
        ruleId: "RBI_REALISATION",
      },
      {
        id: "credit-note:REFUND-1",
        date: "2026-11-30",
        kind: "credit_note_declare_by",
        title: `Upcoming: Declare credit note for invoice ${invoice.number}`,
        state: "upcoming",
        href,
        ruleId: "CREDIT_NOTE",
      },
      {
        id: "dispute:DISPUTE-1",
        date: "2026-10-30",
        kind: "dispute_response",
        title: "Overdue: Respond to PayPal dispute DISPUTE-1",
        state: "overdue",
        href,
        ruleId: null,
      },
      {
        id: `recurring:${invoice.id}:10`,
        date: "2026-11-30",
        kind: "recurring_invoice",
        title: `Upcoming: Expected PayPal recurring invoice (series of ${invoice.number})`,
        state: "upcoming",
        href,
        ruleId: null,
      },
    ];
    for (const event of expected) expect(result).toContainEqual(event);
    expect(new Set(result.map((event) => event.kind)).size).toBe(7);
    expect(calendarEventSchema.array().parse(result)).toEqual(result);
  });

  it("uses compliance overdue status and distinguishes resolved disputes and elapsed filing dates", () => {
    const overdueView = toInvoiceView(invoice, true, "2026-11-01");
    const result = events([overdueView], "2026-11-01");
    expect(result.find((event) => event.kind === "rbi_deadline")).toMatchObject({
      state: "overdue",
      title: `Overdue: RBI deadline for invoice ${invoice.number}`,
    });
    expect(result.find((event) => event.id === "gstr1:2026-09")).toMatchObject({
      state: "past",
      title: "Past: GSTR-1 due for September 2026",
    });
    const resolved = {
      ...view,
      disputes: view.disputes.map((dispute) => ({ ...dispute, status: "RESOLVED" })),
    };
    expect(events([resolved]).find((event) => event.kind === "dispute_response")).toMatchObject({
      state: "past",
      title: "Past: Respond to PayPal dispute DISPUTE-1",
    });
    const dueToday = {
      ...view,
      disputes: view.disputes.map((dispute) => ({ ...dispute, responseDueDate: today })),
    };
    expect(events([dueToday]).find((event) => event.kind === "dispute_response")?.state).toBe(
      "upcoming",
    );
    expect(events().find((event) => event.id === "advance-tax:2026-09-15")?.state).toBe("past");
  });

  it("includes both window edges and excludes adjacent dates", () => {
    const dates = ["2026-08-01", "2026-08-02", "2027-12-05", "2027-12-06"];
    const views = dates.map((date, index) => ({
      ...view,
      id: `edge-${index}`,
      disputes: [],
      recurrence: null,
      compliance: {
        ...view.compliance,
        creditNotes: [],
        deadline: {
          ...view.compliance.deadline,
          deadline: date,
          daysRemaining: 0,
          stage: null,
          overdue: false,
          uncertainWindow: false,
          message: "",
          citation: view.compliance.realisation.citation,
        },
      },
    }));
    expect(
      events(views)
        .filter((event) => event.kind === "rbi_deadline")
        .map((event) => event.date),
    ).toEqual(["2026-08-02", "2027-12-05"]);
  });

  it.each([null, { ...profile, gstRegistered: false }])(
    "omits GST events without a registered profile",
    (profile) => {
      const result = buildCalendarEvents({ profile, views: [view] }, today, rules);
      expect(
        result.some((event) => event.kind === "lut_renewal" || event.kind === "gstr1_due"),
      ).toBe(false);
      expect(result.some((event) => event.kind === "rbi_deadline")).toBe(true);
    },
  );

  it("omits only missing LUT and filing-frequency events", () => {
    const result = buildCalendarEvents(
      { profile: { ...profile, lutValidTo: null, gstr1Frequency: null }, views: [] },
      today,
      rules,
    );
    expect(result.every((event) => event.kind === "advance_tax")).toBe(true);
  });

  it.each(["monthly", "quarterly"] as const)(
    "uses rules for all %s filing dates and all overlapping tax years",
    (gstr1Frequency) => {
      const result = buildCalendarEvents(
        { profile: { ...profile, gstr1Frequency }, views: [] },
        today,
        rules,
      );
      expect(
        result.filter((event) => event.kind === "gstr1_due").map((event) => [event.id, event.date]),
      ).toEqual(
        gstr1PeriodsDueBetween(gstr1Frequency, "2026-08-02", "2027-12-05", rules).map((period) => [
          `gstr1:${period}`,
          gstr1Period(period, rules).dueDate,
        ]),
      );
      const dates = ["2026-27", "2027-28"]
        .flatMap((year) => advanceTaxDates(year, rules))
        .map((entry) => entry.date)
        .filter((date) => date >= "2026-08-02" && date <= "2027-12-05");
      expect(
        result.filter((event) => event.kind === "advance_tax").map((event) => event.date),
      ).toEqual(dates);
    },
  );

  it("omits RBI events for paid invoices and disputes without a response date", () => {
    const paid = toInvoiceView(
      {
        ...invoice,
        status: "paid",
        paidTotal: "100.00",
        refundedTotal: "0.00",
        refunds: [],
        disputes: invoice.disputes.map((dispute) => ({ ...dispute, responseDueDate: null })),
      },
      true,
      today,
    );
    expect(
      events([paid]).some(
        (event) => event.kind === "rbi_deadline" || event.kind === "dispute_response",
      ),
    ).toBe(false);
  });

  it.each([
    {
      date: "2026-01-31",
      intervalUnit: "MONTH",
      intervalCount: 1,
      asOf: "2026-02-01",
      expected: ["2026-02-28", "2026-03-31"],
    },
    {
      date: "2028-01-31",
      intervalUnit: "MONTH",
      intervalCount: 1,
      asOf: "2028-02-01",
      expected: ["2028-02-29", "2028-03-31"],
    },
    {
      date: "2028-02-29",
      intervalUnit: "YEAR",
      intervalCount: 1,
      asOf: "2029-01-01",
      expected: ["2029-02-28"],
    },
    {
      date: "2026-12-28",
      intervalUnit: "WEEK",
      intervalCount: 2,
      asOf: "2027-01-01",
      expected: ["2027-01-11", "2027-01-25"],
    },
    {
      date: "2026-01-31",
      intervalUnit: "MONTH",
      intervalCount: 3,
      asOf: "2026-02-01",
      expected: ["2026-04-30", "2026-07-31"],
    },
  ] as const)(
    "anchors recurring $intervalUnit dates to $date",
    ({ date, intervalUnit, intervalCount, asOf, expected }) => {
      const recurring = {
        ...view,
        date,
        recurrence: { intervalUnit, intervalCount, totalCycles: 3 },
      };
      expect(
        events([recurring], asOf)
          .filter((event) => event.kind === "recurring_invoice")
          .map((event) => event.date),
      ).toEqual(expected);
      expect(
        events(
          [{ ...recurring, recurrence: { ...recurring.recurrence, totalCycles: 1 } }],
          asOf,
        ).some((event) => event.kind === "recurring_invoice"),
      ).toBe(false);
    },
  );

  it("returns unique IDs in date then ID order regardless of input order", () => {
    const other = { ...view, id: "other" };
    const result = events([view, other, view]);
    expect(new Set(result.map((event) => event.id)).size).toBe(result.length);
    expect(result).toEqual(events([other, view]));
    expect(result).toEqual(
      [...result].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    );
  });
});
