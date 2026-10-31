import { BryntumCalendar } from "@bryntum/calendar-react";
import type { CalendarEvent } from "@niryat/shared";
import { isValidElement } from "react";
import { expect, it, vi } from "vitest";
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

it("keeps month/list modes read-only and navigates only for known local events", () => {
  const event: CalendarEvent = {
    id: "rbi:invoice-1",
    date: "2026-11-01",
    kind: "rbi_deadline",
    title: "Upcoming: RBI deadline for invoice 1",
    state: "upcoming",
    href: "/invoices#invoice-1",
    ruleId: "RBI_REALISATION",
  };
  const element = CalendarView({
    events: [event, { ...event, id: "external", href: "//example.invalid" }],
  });
  if (
    !isValidElement<{
      readOnly: boolean;
      mode: string;
      modes: Record<string, boolean>;
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
    week: false,
    month: true,
    year: false,
    agenda: false,
    list: true,
  });

  element.props.onEventClick({ eventRecord: { id: event.id } });
  expect(push).toHaveBeenCalledExactlyOnceWith(event.href);
  element.props.onEventClick({ eventRecord: { id: "missing" } });
  element.props.onEventClick({ eventRecord: { id: "external" } });
  expect(push).toHaveBeenCalledTimes(1);
});
