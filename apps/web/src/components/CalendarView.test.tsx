import { BryntumCalendar } from "@bryntum/calendar-react";
import type { CalendarEvent } from "@niryat/shared";
import { isValidElement } from "react";
import { expect, it, vi } from "vitest";
import { calendarResources } from "../lib/calendar";
import { sendJson } from "../lib/forms";
import CalendarViewComponent from "./CalendarView";

function CalendarView(props: Parameters<typeof CalendarViewComponent>[0]) {
  return CalendarViewComponent(props).props.children[1];
}

const { push, refresh, setMessage } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  setMessage: vi.fn(),
}));

vi.mock("@bryntum/calendar-react", () => ({ BryntumCalendar: () => null }));
vi.mock("@bryntum/calendar/calendar.css", () => ({}));
vi.mock("@bryntum/calendar/svalbard-light.css", () => ({}));
vi.mock("@bryntum/calendar/fontawesome/css/fontawesome.css", () => ({}));
vi.mock("@bryntum/calendar/fontawesome/css/solid.css", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("../lib/forms", () => ({ sendJson: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: () => ({ current: null }),
  useState: () => ["", setMessage],
  useMemo: (compute: () => unknown) => compute(),
}));

it("shows category filters and five read-only modes, navigating only for known local events", () => {
  const event: CalendarEvent = {
    id: "rbi:invoice-1",
    date: "2026-11-01",
    kind: "rbi_deadline",
    title: "Upcoming: Export payment deadline (RBI) for invoice 1",
    state: "upcoming",
    href: "/invoices#invoice-1",
    ruleId: "RBI_REALISATION",
    action: "Ask your client for payment.",
    source: "RBI source",
  };
  const element = CalendarView({
    events: [event, { ...event, id: "external", href: "//example.invalid" }],
  });
  if (
    !isValidElement<{
      readOnly: boolean;
      mode: string;
      modes: Record<string, boolean>;
      sidebar: { collapsed: boolean; items?: unknown };
      resources: typeof calendarResources;
      events: { resourceId: string; cls: string; name: string }[];
      eventTooltipFeature: {
        showOn: string;
        titleRenderer: (record: { id: string }) => { text: string };
        renderer: (context: { eventRecord: { id: string } }) => Promise<unknown>;
      };
      onEventClick: (click: { eventRecord: { id: string } }) => void;
    }>(element)
  ) {
    throw new Error("Expected the calendar element");
  }
  expect(element.type).toBe(BryntumCalendar);
  expect(element.props.readOnly).toBe(true);
  expect(element.props.mode).toBe("month");
  expect(element.props.modes).toEqual({
    day: false,
    week: true,
    month: true,
    year: true,
    agenda: true,
    list: true,
  });
  expect(element.props.sidebar).toEqual({ collapsed: false }); // keep Bryntum's default resource filter
  expect(element.props.resources).toEqual(calendarResources);
  expect(element.props.events[0]).toMatchObject({
    resourceId: "rbi",
    cls: "niryat-upcoming",
    name: event.title,
  });
  expect(element.props.eventTooltipFeature.showOn).toBe("mouseover");

  element.props.onEventClick({ eventRecord: { id: event.id } });
  expect(push).toHaveBeenCalledExactlyOnceWith(event.href);
  element.props.onEventClick({ eventRecord: { id: "missing" } });
  element.props.onEventClick({ eventRecord: { id: "external" } });
  expect(push).toHaveBeenCalledTimes(1);
});

it("keeps the sidebar configuration stable when category filtering changes events", () => {
  const event: CalendarEvent = {
    id: "tax",
    date: "2026-11-05",
    kind: "advance_tax",
    title: "Upcoming tax",
    state: "upcoming",
    href: "/advance-tax",
    ruleId: "ADVANCE_TAX_DATES",
    action: "Review your estimate with your CA.",
    source: "Tax source",
  };
  const before = CalendarView({ events: [event] });
  const filtered = CalendarView({ events: [] });
  const restored = CalendarView({ events: [event] });
  expect(filtered.props.sidebar).toBe(before.props.sidebar);
  expect(restored.props.sidebar).toBe(before.props.sidebar);
});

it("uses text nodes for untrusted tooltip data and omits unsafe Open links", async () => {
  const event: CalendarEvent = {
    id: "unsafe",
    date: "2026-11-05",
    kind: "dispute_response",
    state: "upcoming",
    title: '<img src=x onerror="alert(1)">',
    action: "<script>bad()</script>",
    source: '<a href="javascript:bad()">source</a>',
    href: '/invoices?x="<bad>',
    ruleId: null,
  };
  const element = CalendarView({
    events: [
      event,
      { ...event, id: "external", href: "//evil.test" },
      { ...event, id: "backslash", href: "/\\evil.test" },
      { ...event, id: "paypal", source: null },
    ],
  });
  const tooltip = element.props.eventTooltipFeature;
  expect(tooltip.titleRenderer({ id: event.id })).toEqual({ text: event.title });
  expect(await tooltip.renderer({ eventRecord: { id: event.id } })).toEqual({
    children: [
      { tag: "p", text: event.action },
      { tag: "p", text: `Source: ${event.source}` },
      { tag: "a", href: event.href, text: "Open" },
    ],
  });
  for (const id of ["external", "backslash"]) {
    expect(await tooltip.renderer({ eventRecord: { id } })).toEqual({
      children: [
        { tag: "p", text: event.action },
        { tag: "p", text: `Source: ${event.source}` },
      ],
    });
  }
  expect(await tooltip.renderer({ eventRecord: { id: "paypal" } })).toEqual({
    children: [
      { tag: "p", text: event.action },
      { tag: "a", href: event.href, text: "Open" },
    ],
  });
  expect(await tooltip.renderer({ eventRecord: { id: "missing" } })).toBe("");
});

it("locks deadlines and CA events, persisting task moves before accepting a drop", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const task: CalendarEvent = {
    id: `task:${id}`,
    date: "2026-11-05",
    kind: "planned_task",
    title: "Plan work",
    state: "upcoming",
    action: "Plan work",
    source: null,
    ruleId: null,
    href: "/tasks",
  };
  const deadline = { ...task, id: "legal", kind: "advance_tax" as const };
  const caTask = { ...task, id: `client:task:${id}`, freelancerId: id };
  const element = CalendarView({ events: [task, deadline, caTask], canPlan: true });
  expect(element.props.readOnly).toBe(false);
  expect(element.props.autoCreate).toBe(false);
  expect(element.props.eventEditFeature).toBe(false);
  expect(element.props.eventCopyPasteFeature).toBe(false);
  expect(element.props.onBeforeEventDelete()).toBe(false);
  expect(element.props.eventMenuFeature).toBe(false);
  expect(element.props.scheduleMenuFeature).toBe(false);
  expect(element.props.dragFeature).toEqual({ creatable: false, resizable: false });
  expect(element.props.events.map((event: { readOnly: boolean }) => event.readOnly)).toEqual([
    false,
    true,
    true,
  ]);
  for (const item of [deadline, caTask, { ...task, id: "unknown" }]) {
    expect(element.props.onBeforeDragMove({ eventRecord: { id: item.id } })).toBe(false);
    expect(
      await element.props.onBeforeDragMoveEnd({
        eventRecord: { id: item.id },
        newStartDate: new Date(2026, 10, 6),
      }),
    ).toBe(false);
  }
  expect(
    CalendarView({ events: [task] }).props.onBeforeDragMove({ eventRecord: { id: task.id } }),
  ).toBe(false);
  expect(element.props.onBeforeDragMove({ eventRecord: { id: task.id } })).toBe(true);
  expect(
    await element.props.onBeforeDragMoveEnd({
      eventRecord: { id: task.id },
      newStartDate: new Date(2026, 10, 6),
      validation: false,
    }),
  ).toBe(false);
  let resolve: (value: { ok: false; message: string }) => void = () => {
    throw new Error("Expected pending save");
  };
  vi.mocked(sendJson).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = element.props.onBeforeDragMoveEnd({
    eventRecord: { id: task.id },
    newStartDate: new Date(2026, 11, 31),
  });
  expect(element.props.onBeforeDragMove({ eventRecord: { id: task.id } })).toBe(false);
  resolve({ ok: false, message: "Could not save." });
  expect(await pending).toBe(false);
  expect(setMessage).toHaveBeenLastCalledWith("Could not save.");
  expect(sendJson).toHaveBeenLastCalledWith(
    `/api/tasks/${id}/plan`,
    "POST",
    { plannedDate: "2026-12-31" },
    expect.anything(),
  );
  vi.mocked(sendJson).mockResolvedValueOnce({ ok: true, data: {} });
  expect(
    await element.props.onBeforeDragMoveEnd({
      eventRecord: { id: task.id },
      newStartDate: new Date(2027, 0, 1),
    }),
  ).toBe(true);
  expect(setMessage).toHaveBeenLastCalledWith("Planned date saved.");
  element.props.onDragMoveEnd();
  expect(refresh).toHaveBeenCalled();
});
