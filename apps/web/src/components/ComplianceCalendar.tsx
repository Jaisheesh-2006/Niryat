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
  canPlan = false,
}: {
  events: readonly (CalendarEvent & { freelancerId?: string })[];
  resources?: typeof calendarResources;
  canPlan?: boolean;
}) {
  return <CalendarView events={events} resources={resources} canPlan={canPlan} />;
}
