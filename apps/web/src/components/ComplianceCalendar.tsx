"use client";

import type { CalendarEvent } from "@niryat/shared";
import dynamic from "next/dynamic";

const CalendarView = dynamic(() => import("./CalendarView"), {
  ssr: false,
  loading: () => <p>Loading calendar. Deadlines are listed below.</p>,
});

export function ComplianceCalendar({ events }: { events: readonly CalendarEvent[] }) {
  return <CalendarView events={events} />;
}
