import {
  advanceTaxDates,
  cite,
  financialYear,
  gstr1Period,
  gstr1PeriodsDueBetween,
  type RuleMetadata,
} from "@niryat/rules";
import type { CalendarEvent, InvoiceView, ProfileInput } from "@niryat/shared";
import { z } from "zod";

const calendarActions = {
  lut_renewal:
    "Ask your CA to renew your yearly export form (LUT) on the GST portal, then update your profile dates.",
  gstr1_due:
    "Ask your CA to file your GST sales return (GSTR-1) for this period. Use the export file from the GST sales return page.",
  advance_tax:
    "Review your advance-tax estimate with your CA and pay any amount due on the income-tax portal.",
  rbi_deadline:
    "Follow up with your client for payment and ask your bank about an extension if the export payment is delayed.",
  credit_note_declare_by:
    "Ask your CA to report this refund's invoice adjustment (credit note) in your GST sales return.",
  dispute_response:
    "Review the dispute in PayPal and submit your response there if it is still open.",
  recurring_invoice:
    "Check in PayPal whether the expected invoice was created and review it before taking any action.",
} satisfies Record<CalendarEvent["kind"], string>;

export function buildCalendarEvents(
  input: {
    profile: Pick<ProfileInput, "gstRegistered" | "lutValidTo" | "gstr1Frequency"> | null;
    views: readonly InvoiceView[];
  },
  today: string,
  rules: readonly RuleMetadata[],
): CalendarEvent[] {
  const date = new Date(`${z.iso.date().parse(today)}T00:00:00.000Z`);
  const from = new Date(date);
  from.setUTCDate(from.getUTCDate() - 90);
  const to = new Date(date);
  to.setUTCDate(to.getUTCDate() + 400);
  const start = from.toISOString().slice(0, 10);
  const end = to.toISOString().slice(0, 10);
  const events = new Map<string, CalendarEvent>();
  function add(event: Omit<CalendarEvent, "state" | "action" | "source">, overdue = false) {
    if ((event.date < start && !overdue) || event.date > end) return;
    const state = overdue ? "overdue" : event.date < today ? "past" : "upcoming";
    const prefix = { overdue: "Overdue: ", upcoming: "Upcoming: ", past: "Past: " }[state];
    events.set(event.id, {
      ...event,
      state,
      title: prefix + event.title,
      action: calendarActions[event.kind],
      source: event.ruleId === null ? null : cite(rules, event.ruleId).source,
    });
  }

  const { profile } = input;
  if (profile?.gstRegistered) {
    if (profile.lutValidTo) {
      add({
        id: `lut:${profile.lutValidTo}`,
        date: profile.lutValidTo,
        kind: "lut_renewal",
        title: "Yearly export form (LUT) expires",
        href: "/profile",
        ruleId: "LUT_REQUIRED",
      });
    }
    if (profile.gstr1Frequency) {
      for (const period of gstr1PeriodsDueBetween(profile.gstr1Frequency, start, end, rules)) {
        const { dueDate, label } = gstr1Period(period, rules);
        add({
          id: `gstr1:${period}`,
          date: dueDate,
          kind: "gstr1_due",
          title: `GST sales return (GSTR-1) due for ${label}`,
          href: `/gstr1?period=${period}`,
          ruleId: "GSTR1_6A",
        });
      }
    }
  }
  const firstYear = Number(financialYear(start).slice(0, 4));
  const lastYear = Number(financialYear(end).slice(0, 4));
  for (let year = firstYear; year <= lastYear; year++) {
    const taxYear = financialYear(`${String(year).padStart(4, "0")}-04-01`);
    for (const { date, cumulativePercent } of advanceTaxDates(taxYear, rules)) {
      add({
        id: `advance-tax:${date}`,
        date,
        kind: "advance_tax",
        title: date.endsWith("-03-15")
          ? "Income tax payment (advance tax): 100% due. Filers using the simpler scheme (presumptive taxation) pay it all by this date."
          : `Income tax payment (advance tax): ${cumulativePercent}% of the year's tax due`,
        href: `/advance-tax?taxYear=${taxYear}`,
        ruleId: "ADVANCE_TAX_DATES",
      });
    }
  }
  for (const view of input.views) {
    const href = `/invoices#invoice-${view.id}`;
    const { deadline, creditNotes } = view.compliance;
    if (deadline) {
      add(
        {
          id: `rbi:${view.id}`,
          date: deadline.deadline,
          kind: "rbi_deadline",
          title: `Export payment deadline (RBI) for invoice ${view.number}`,
          href,
          ruleId: "RBI_REALISATION",
        },
        deadline.overdue,
      );
    }
    for (const note of creditNotes) {
      add({
        id: `credit-note:${note.refundId}`,
        date: note.declareBy,
        kind: "credit_note_declare_by",
        title: `Report invoice adjustment (credit note) for invoice ${view.number}`,
        href,
        ruleId: "CREDIT_NOTE",
      });
    }
    for (const dispute of view.disputes) {
      if (!dispute.responseDueDate) continue;
      add(
        {
          id: `dispute:${dispute.paypalDisputeId}`,
          date: dispute.responseDueDate,
          kind: "dispute_response",
          title: `Respond to PayPal dispute ${dispute.paypalDisputeId}`,
          href,
          ruleId: null,
        },
        dispute.status !== "RESOLVED" && dispute.responseDueDate < today,
      );
    }
    if (view.type !== "recurring" || !view.recurrence) continue;
    const original = new Date(`${view.date}T00:00:00.000Z`);
    const { intervalUnit, intervalCount, totalCycles } = view.recurrence;
    for (let k = 1; k < totalCycles; k++) {
      const next = new Date(original);
      if (intervalUnit === "WEEK") {
        next.setUTCDate(original.getUTCDate() + k * intervalCount * 7);
      } else {
        const months = k * intervalCount * (intervalUnit === "YEAR" ? 12 : 1);
        next.setUTCMonth(original.getUTCMonth() + months + 1, 0);
        next.setUTCDate(Math.min(original.getUTCDate(), next.getUTCDate()));
      }
      add({
        id: `recurring:${view.id}:${k}`,
        date: next.toISOString().slice(0, 10),
        kind: "recurring_invoice",
        title: `Expected PayPal recurring invoice (series of ${view.number})`,
        href,
        ruleId: null,
      });
    }
  }
  return [...events.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}
