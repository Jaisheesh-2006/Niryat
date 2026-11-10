"use client";

import type { EventTooltipConfig, SidebarConfig } from "@bryntum/calendar";
import { BryntumCalendar } from "@bryntum/calendar-react";
import { type CalendarEvent, taskPlanInputSchema, taskSchema } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { calendarResources, toBryntumEvents } from "../lib/calendar";
import { sendJson } from "../lib/forms";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/svalbard-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";

// The resource filter is a default sidebar item; overriding it with `true` drops its type and renders an empty widget.
const calendarSidebar = { collapsed: false } satisfies SidebarConfig;

const calendarDrag = { creatable: false, resizable: false };

export default function CalendarView({
  events,
  resources = calendarResources,
  canPlan = false,
}: {
  events: readonly (CalendarEvent & { freelancerId?: string })[];
  resources?: typeof calendarResources;
  canPlan?: boolean;
}) {
  const calendarRef = useRef<BryntumCalendar>(null);
  const router = useRouter();
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const calendarEvents = useMemo(() => toBryntumEvents(events, canPlan), [events, canPlan]);
  function movable(id: string | number) {
    return (
      canPlan &&
      events.some(
        (event) =>
          event.id === String(id) &&
          event.kind === "planned_task" &&
          event.freelancerId === undefined,
      )
    );
  }
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
    <>
      <p role="status">{message}</p>
      <BryntumCalendar
        ref={calendarRef}
        height="40rem"
        readOnly={!canPlan}
        autoCreate={false}
        eventEditFeature={false}
        eventCopyPasteFeature={false}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        dragFeature={calendarDrag}
        onBeforeEventDelete={() => false}
        onBeforeDragMove={({ eventRecord }) => !saving.current && movable(eventRecord.id)}
        onBeforeDragMoveEnd={async ({ eventRecord, newStartDate, validation }) => {
          if (validation === false || saving.current || !movable(eventRecord.id)) return false;
          const id = z.uuid().safeParse(String(eventRecord.id).slice(5));
          // Bryntum all-day dates use the displayed local day, not a UTC instant.
          const plannedDate = `${newStartDate.getFullYear()}-${String(newStartDate.getMonth() + 1).padStart(2, "0")}-${String(newStartDate.getDate()).padStart(2, "0")}`;
          const plan = taskPlanInputSchema.safeParse({ plannedDate });
          if (!id.success || !plan.success) return false;
          saving.current = true;
          setMessage("Saving planned date…");
          try {
            const result = await sendJson(
              `/api/tasks/${id.data}/plan`,
              "POST",
              plan.data,
              taskSchema,
            );
            setMessage(result.ok ? "Planned date saved." : result.message);
            return result.ok;
          } finally {
            saving.current = false;
          }
        }}
        onDragMoveEnd={() => router.refresh()}
        mode="month"
        modes={{ day: false, week: true, month: true, year: true, agenda: true, list: true }}
        sidebar={calendarSidebar}
        resources={resources}
        events={calendarEvents}
        eventTooltipFeature={tooltip}
        onEventClick={({ eventRecord }) => {
          const event = events.find((item) => item.id === String(eventRecord.id));
          if (event?.href.startsWith("/") && !/^\/[\\/]/.test(event.href)) router.push(event.href);
        }}
      />
    </>
  );
}
