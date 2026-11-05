import { type CalendarEvent, calendarEventSchema } from "@niryat/shared";
import { expect, it } from "vitest";
import { caCalendarResources, calendarResources, deadlineList, toBryntumEvents } from "./calendar";

it.each(["overdue", "upcoming", "past"] as const)(
  "maps an all-day %s event and preserves its title and link",
  (state) => {
    const event: CalendarEvent = calendarEventSchema.parse({
      id: "rbi:invoice-1",
      date: "2026-12-31",
      kind: "rbi_deadline",
      title: `${{ overdue: "Overdue", upcoming: "Upcoming", past: "Past" }[state]}: Export payment deadline (RBI) for invoice 1`,
      state,
      href: "/invoices#invoice-1",
      ruleId: "RBI_REALISATION",
      action: "Ask your client for payment.",
      source: "RBI source",
    });
    expect(toBryntumEvents([event])).toEqual([
      {
        id: event.id,
        name: event.title,
        startDate: "2026-12-31T00:00:00",
        endDate: "2027-01-01T00:00:00",
        allDay: true,
        resourceId: "rbi",
        cls: `niryat-${state}`,
        href: event.href,
        action: event.action,
        source: event.source,
      },
    ]);
    expect(event.date).toBe("2026-12-31");
  },
);

it("maps an empty calendar", () => {
  expect(toBryntumEvents([])).toEqual([]);
});

it("assigns client resources and cycles token colours without merging equal names", () => {
  const clients = Array.from({ length: 6 }, (_, i) => ({ id: `client-${i}`, name: "Same name" }));
  const resources = caCalendarResources(clients);
  expect(resources).toHaveLength(6);
  for (const [index, resource] of resources.entries()) {
    expect(resource).toEqual({
      ...clients[index],
      eventColor: calendarResources[index % 4]?.eventColor,
    });
    const event: CalendarEvent & { freelancerId: string } = {
      freelancerId: resource.id,
      id: `${resource.id}:tax`,
      date: "2026-11-05",
      kind: "advance_tax",
      title: "Upcoming tax",
      state: "upcoming",
      href: `/ca/clients/${resource.id}`,
      action: "Review with your CA.",
      source: "Tax source",
      ruleId: "ADVANCE_TAX_DATES",
    };
    expect(toBryntumEvents([event])[0]).toMatchObject({
      resourceId: resource.id,
      href: event.href,
      action: event.action,
      source: event.source,
    });
    expect(deadlineList([event], 10)[0]?.freelancerId).toBe(resource.id);
  }
  expect(caCalendarResources([])).toEqual([]);
});

it("assigns every event kind to its category resource", () => {
  const categories = {
    lut_renewal: "gst",
    gstr1_due: "gst",
    credit_note_declare_by: "gst",
    advance_tax: "income_tax",
    rbi_deadline: "rbi",
    dispute_response: "paypal",
    recurring_invoice: "paypal",
  } satisfies Record<CalendarEvent["kind"], string>;
  for (const kind of calendarEventSchema.shape.kind.options) {
    const event: CalendarEvent = {
      id: kind,
      date: "2026-11-05",
      kind,
      title: `Upcoming: ${kind}`,
      state: "upcoming",
      href: "/calendar",
      ruleId: null,
      action: "Review this deadline with your CA.",
      source: null,
    };
    const mapped = toBryntumEvents([event])[0];
    expect(mapped?.resourceId).toBe(categories[kind]);
    expect(calendarResources.some((resource) => resource.id === mapped?.resourceId)).toBe(true);
    expect(mapped).not.toHaveProperty("eventColor");
  }
  expect(calendarResources).toEqual([
    { id: "gst", name: "GST", eventColor: "var(--niryat-cat-gst)" },
    { id: "income_tax", name: "Income tax", eventColor: "var(--niryat-cat-income-tax)" },
    { id: "rbi", name: "RBI payment deadlines", eventColor: "var(--niryat-cat-rbi)" },
    { id: "paypal", name: "PayPal", eventColor: "var(--niryat-cat-paypal)" },
  ]);
});

it("keeps every overdue event and only N upcoming events, sorted by date then id", () => {
  function event(id: string, date: string, state: CalendarEvent["state"]): CalendarEvent {
    return {
      id,
      date,
      state,
      kind: "rbi_deadline",
      title: id,
      href: "/invoices",
      ruleId: null,
      action: "Review with your CA.",
      source: null,
    };
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
