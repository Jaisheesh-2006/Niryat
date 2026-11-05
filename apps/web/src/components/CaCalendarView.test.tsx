import type { CaCalendar } from "@niryat/shared";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { caCalendarResources, calendarResources } from "../lib/calendar";
import { CaCalendarView } from "./CaCalendarView";
import { ComplianceCalendar } from "./ComplianceCalendar";

const state = vi.hoisted(() => ({ categories: undefined as string[] | undefined }));
vi.mock("./ComplianceCalendar", () => ({ ComplianceCalendar: vi.fn(() => null) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: string[]) => [
    state.categories ?? initial,
    (update: (current: string[]) => string[]) => {
      state.categories = update(state.categories ?? initial);
    },
  ],
}));
afterEach(() => {
  state.categories = undefined;
  vi.clearAllMocks();
});

const calendar: CaCalendar = {
  clients: [{ id: "10000000-0000-4000-8000-000000000001", name: "Ananya <client>" }],
  events: (["gstr1_due", "advance_tax", "rbi_deadline", "dispute_response"] as const).map(
    (kind) => ({
      id: kind,
      freelancerId: "10000000-0000-4000-8000-000000000001",
      date: "2026-11-05",
      kind,
      title: `Upcoming ${kind}`,
      state: "upcoming",
      href: "/ca/clients/10000000-0000-4000-8000-000000000001",
      action: "Review this deadline.",
      source: null,
      ruleId: null,
    }),
  ),
};

it("shows checked category controls and passes client resources, labels and events to the shared calendar", () => {
  const html = renderToStaticMarkup(CaCalendarView(calendar));
  expect(html).toContain("<legend>Deadline categories</legend>");
  for (const resource of calendarResources) expect(html).toContain(resource.name);
  expect(html.match(/checked=""/g)).toHaveLength(4);
  expect(vi.mocked(ComplianceCalendar).mock.calls[0]?.[0]).toEqual({
    resources: caCalendarResources(calendar.clients),
    events: calendar.events.map((event) => ({
      ...event,
      title: `Ananya <client>: ${event.title}`,
    })),
  });
});

it("filters categories while keeping every client resource available", () => {
  state.categories = ["gst", "rbi"];
  renderToStaticMarkup(CaCalendarView(calendar));
  const props = vi.mocked(ComplianceCalendar).mock.calls[0]?.[0];
  expect(props?.events.map((event) => event.kind)).toEqual(["gstr1_due", "rbi_deadline"]);
  expect(props?.resources).toEqual(caCalendarResources(calendar.clients));
  state.categories = [];
  renderToStaticMarkup(CaCalendarView(calendar));
  expect(vi.mocked(ComplianceCalendar).mock.calls[1]?.[0].events).toEqual([]);
});

it("unticks and restores a category through its checkbox", () => {
  const fieldset = Children.toArray(CaCalendarView(calendar).props.children)[0];
  if (!isValidElement<{ children: ReactNode }>(fieldset)) throw new Error("Expected fieldset");
  const label = Children.toArray(fieldset.props.children)[1];
  if (!isValidElement<{ children: ReactNode }>(label)) throw new Error("Expected label");
  const input = Children.toArray(label.props.children)[0];
  if (
    !isValidElement<{ onChange: (event: { currentTarget: { checked: boolean } }) => void }>(input)
  )
    throw new Error("Expected checkbox");
  input.props.onChange({ currentTarget: { checked: false } });
  expect(state.categories).toEqual(["income_tax", "rbi", "paypal"]);
  input.props.onChange({ currentTarget: { checked: true } });
  expect(state.categories).toEqual(["income_tax", "rbi", "paypal", "gst"]);
});
