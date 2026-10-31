"use client";

import { BryntumCalendar } from "@bryntum/calendar-react";
import type { CalendarEvent } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toBryntumEvents } from "../lib/calendar";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/svalbard-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";

export default function CalendarView({ events }: { events: readonly CalendarEvent[] }) {
  const calendarRef = useRef<BryntumCalendar>(null);
  const router = useRouter();
  return (
    <BryntumCalendar
      ref={calendarRef}
      height="40rem"
      readOnly
      mode="month"
      modes={{ day: false, week: false, month: true, year: false, agenda: false, list: true }}
      events={toBryntumEvents(events)}
      onEventClick={({ eventRecord }) => {
        const event = events.find((item) => item.id === String(eventRecord.id));
        if (event && !event.href.startsWith("//")) router.push(event.href);
      }}
    />
  );
}
