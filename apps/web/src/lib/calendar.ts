import type { CaCalendar, CalendarEvent } from "@niryat/shared";

export const calendarResources = [
  { id: "gst", name: "GST", eventColor: "var(--niryat-cat-gst)" },
  { id: "income_tax", name: "Income tax", eventColor: "var(--niryat-cat-income-tax)" },
  { id: "rbi", name: "RBI payment deadlines", eventColor: "var(--niryat-cat-rbi)" },
  { id: "paypal", name: "PayPal", eventColor: "var(--niryat-cat-paypal)" },
];

export const planningResources = [
  ...calendarResources,
  { id: "tasks", name: "My tasks", eventColor: "var(--niryat-cat-income-tax)" },
];

export function calendarResourceId(kind: CalendarEvent["kind"]) {
  switch (kind) {
    case "planned_task":
      return "tasks";
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

export function deadlineList<Event extends CalendarEvent>(
  events: readonly Event[],
  upcomingLimit: number,
): Event[] {
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  return [
    ...sorted.filter((event) => event.kind !== "planned_task" && event.state === "overdue"),
    ...sorted
      .filter((event) => event.kind !== "planned_task" && event.state === "upcoming")
      .slice(0, upcomingLimit),
  ];
}

export function caCalendarResources(clients: CaCalendar["clients"]) {
  return clients.map((client, index) => ({
    ...client,
    eventColor:
      calendarResources[index % calendarResources.length]?.eventColor ?? "var(--niryat-cat-gst)",
  }));
}

export function toBryntumEvents(
  events: readonly (CalendarEvent & { freelancerId?: string })[],
  canPlan = false,
) {
  return events.map((event) => {
    const end = new Date(`${event.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      id: event.id,
      name: event.title,
      startDate: `${event.date}T00:00:00`,
      endDate: `${end.toISOString().slice(0, 10)}T00:00:00`,
      allDay: true,
      readOnly: !canPlan || event.kind !== "planned_task" || event.freelancerId !== undefined,
      draggable: canPlan && event.kind === "planned_task" && event.freelancerId === undefined,
      resizable: false,
      resourceId: event.freelancerId ?? calendarResourceId(event.kind),
      cls: `niryat-${event.state}`,
      href: event.href,
      action: event.action,
      source: event.source,
    };
  });
}
