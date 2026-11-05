import type { CalendarEvent } from "@niryat/shared";

export const calendarResources = [
  { id: "gst", name: "GST", eventColor: "var(--niryat-cat-gst)" },
  { id: "income_tax", name: "Income tax", eventColor: "var(--niryat-cat-income-tax)" },
  { id: "rbi", name: "RBI payment deadlines", eventColor: "var(--niryat-cat-rbi)" },
  { id: "paypal", name: "PayPal", eventColor: "var(--niryat-cat-paypal)" },
];

function calendarResourceId(kind: CalendarEvent["kind"]) {
  switch (kind) {
    case "lut_renewal":
    case "gstr1_due":
    case "credit_note_declare_by":
      return "gst";
    case "advance_tax":
      return "income_tax";
    case "rbi_deadline":
      return "rbi";
    case "dispute_response":
    case "recurring_invoice":
      return "paypal";
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled calendar kind: ${unhandled}`);
    }
  }
}

export function deadlineList(
  events: readonly CalendarEvent[],
  upcomingLimit: number,
): CalendarEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  return [
    ...sorted.filter((event) => event.state === "overdue"),
    ...sorted.filter((event) => event.state === "upcoming").slice(0, upcomingLimit),
  ];
}

export function toBryntumEvents(events: readonly CalendarEvent[]) {
  return events.map((event) => {
    const end = new Date(`${event.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      id: event.id,
      name: event.title,
      startDate: `${event.date}T00:00:00`,
      endDate: `${end.toISOString().slice(0, 10)}T00:00:00`,
      allDay: true,
      resourceId: calendarResourceId(event.kind),
      cls: `niryat-${event.state}`,
      href: event.href,
    };
  });
}
