import { type CalendarEvent, calendarEventSchema } from "@niryat/shared";
import { expect, it } from "vitest";
import { deadlineList, toBryntumEvents } from "./calendar";

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

it("keeps every overdue event and only N upcoming events, sorted by date then id", () => {
  function event(id: string, date: string, state: CalendarEvent["state"]): CalendarEvent {
    return { id, date, state, kind: "rbi_deadline", title: id, href: "/invoices", ruleId: null };
  }
  const events = [
    event("upcoming-c", "2026-11-04", "upcoming"),
    event("overdue-b", "2026-10-30", "overdue"),
    event("past", "2026-10-01", "past"),
    event("upcoming-b", "2026-11-02", "upcoming"),
    event("overdue-a", "2026-10-29", "overdue"),
    event("upcoming-a", "2026-11-02", "upcoming"),
  ];
  expect(deadlineList(events, 2).map((event) => event.id)).toEqual([
    "overdue-a",
    "overdue-b",
    "upcoming-a",
    "upcoming-b",
  ]);
  expect(deadlineList(events, 0).map((event) => event.id)).toEqual(["overdue-a", "overdue-b"]);
  expect(events[0]?.id).toBe("upcoming-c");
  expect(deadlineList([], 5)).toEqual([]);
});
