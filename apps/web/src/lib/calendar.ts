import type { CalendarEvent } from "@niryat/shared";

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
      cls: `niryat-${event.state}`,
      eventColor: `var(--niryat-${event.state})`,
      href: event.href,
    };
  });
}
