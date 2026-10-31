import {
  advanceTaxDates,
  financialYear,
  gstr1Period,
  gstr1PeriodsDueBetween,
  type RuleMetadata,
} from "@niryat/rules";
import type { CalendarEvent, InvoiceView, ProfileInput } from "@niryat/shared";
import { z } from "zod";

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
  function add(event: Omit<CalendarEvent, "state">, overdue = false) {
    if (event.date < start || event.date > end) return;
    const state = overdue ? "overdue" : event.date < today ? "past" : "upcoming";
    const prefix = { overdue: "Overdue: ", upcoming: "Upcoming: ", past: "Past: " }[state];
    events.set(event.id, { ...event, state, title: prefix + event.title });
  }

  const { profile } = input;
  if (profile?.gstRegistered) {
    if (profile.lutValidTo) {
      add({
        id: `lut:${profile.lutValidTo}`,
        date: profile.lutValidTo,
        kind: "lut_renewal",
        title: "LUT expires",
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
          title: `GSTR-1 due for ${label}`,
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
          ? "Advance tax: 100% due (presumptive filers pay it all by this date)"
          : `Advance tax: ${cumulativePercent}% of the year's tax due`,
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
          title: `RBI deadline for invoice ${view.number}`,
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
        title: `Declare credit note for invoice ${view.number}`,
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
