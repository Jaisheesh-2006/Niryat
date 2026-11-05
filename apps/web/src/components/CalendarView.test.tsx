import { BryntumCalendar } from "@bryntum/calendar-react";
import type { CalendarEvent } from "@niryat/shared";
import { isValidElement } from "react";
import { expect, it, vi } from "vitest";
import { calendarResources } from "../lib/calendar";
import CalendarView from "./CalendarView";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@bryntum/calendar-react", () => ({ BryntumCalendar: () => null }));
vi.mock("@bryntum/calendar/calendar.css", () => ({}));
vi.mock("@bryntum/calendar/svalbard-light.css", () => ({}));
vi.mock("@bryntum/calendar/fontawesome/css/fontawesome.css", () => ({}));
vi.mock("@bryntum/calendar/fontawesome/css/solid.css", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: () => ({ current: null }),
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
      sidebar: { collapsed: boolean; items: { resourceFilter: boolean } };
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
  expect(element.props.sidebar).toEqual({ collapsed: false, items: { resourceFilter: true } });
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
