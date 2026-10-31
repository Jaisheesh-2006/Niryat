import { type CalendarEvent, calendarEventSchema } from "@niryat/shared";
import { expect, it } from "vitest";
import { toBryntumEvents } from "./calendar";

it.each(["overdue", "upcoming", "past"] as const)(
  "maps an all-day %s event and preserves its title and link",
  (state) => {
    const event: CalendarEvent = calendarEventSchema.parse({
      id: "rbi:invoice-1",
      date: "2026-12-31",
      kind: "rbi_deadline",
      title: `${{ overdue: "Overdue", upcoming: "Upcoming", past: "Past" }[state]}: RBI deadline for invoice 1`,
      state,
      href: "/invoices#invoice-1",
      ruleId: "RBI_REALISATION",
    });
    expect(toBryntumEvents([event])).toEqual([
      {
        id: event.id,
        name: event.title,
        startDate: "2026-12-31T00:00:00",
        endDate: "2027-01-01T00:00:00",
        allDay: true,
        cls: `niryat-${state}`,
        eventColor: `var(--niryat-${state})`,
        href: event.href,
      },
    ]);
    expect(event.date).toBe("2026-12-31");
  },
);

it("maps an empty calendar", () => {
  expect(toBryntumEvents([])).toEqual([]);
});
