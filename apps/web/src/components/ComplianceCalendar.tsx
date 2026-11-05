"use client";

import type { CalendarEvent } from "@niryat/shared";
import dynamic from "next/dynamic";
import { calendarResources } from "../lib/calendar";

const CalendarView = dynamic(() => import("./CalendarView"), {
  ssr: false,
  loading: () => <p>Loading calendar. Deadlines are listed below.</p>,
});

export function ComplianceCalendar({
  events,
  resources = calendarResources,
}: {
  events: readonly (CalendarEvent & { freelancerId?: string })[];
  resources?: typeof calendarResources;
}) {
  return <CalendarView events={events} resources={resources} />;
}
