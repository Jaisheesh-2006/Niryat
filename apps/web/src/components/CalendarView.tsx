"use client";

import type { EventTooltipConfig, SidebarConfig } from "@bryntum/calendar";
import { BryntumCalendar } from "@bryntum/calendar-react";
import type { CalendarEvent } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { calendarResources, toBryntumEvents } from "../lib/calendar";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/svalbard-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";

const calendarSidebar = {
  collapsed: false,
  items: { resourceFilter: true },
} satisfies SidebarConfig;

export default function CalendarView({
  events,
  resources = calendarResources,
}: {
  events: readonly (CalendarEvent & { freelancerId?: string })[];
  resources?: typeof calendarResources;
}) {
  const calendarRef = useRef<BryntumCalendar>(null);
  const router = useRouter();
  const tooltip = {
    showOn: "mouseover",
    titleRenderer: (record) => ({
      text: events.find((event) => event.id === String(record.id))?.title ?? "",
    }),
    renderer: async ({ eventRecord }) => {
      const event = events.find((item) => item.id === String(eventRecord.id));
      if (!event) return "";
      return {
        children: [
          { tag: "p", text: event.action },
          ...(event.source === null ? [] : [{ tag: "p", text: `Source: ${event.source}` }]),
          ...(event.href.startsWith("/") && !/^\/[\\/]/.test(event.href)
            ? [{ tag: "a", href: event.href, text: "Open" }]
            : []),
        ],
      };
    },
  } satisfies EventTooltipConfig;
  // shortcut: year mode is January–December; add a custom view if April–March is needed.
  return (
    <BryntumCalendar
      ref={calendarRef}
      height="40rem"
      readOnly
      mode="month"
      modes={{ day: false, week: true, month: true, year: true, agenda: true, list: true }}
      sidebar={calendarSidebar}
      resources={resources}
      events={toBryntumEvents(events)}
      eventTooltipFeature={tooltip}
      onEventClick={({ eventRecord }) => {
        const event = events.find((item) => item.id === String(eventRecord.id));
        if (event?.href.startsWith("/") && !/^\/[\\/]/.test(event.href)) router.push(event.href);
      }}
    />
  );
}
