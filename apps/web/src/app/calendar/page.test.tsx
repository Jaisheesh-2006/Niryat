import { type CalendarEvent, calendarEventSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Calendar from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=test" }) }));
vi.mock("../../lib/env", () => ({ apiUrl: "http://localhost:3001" }));
vi.mock("../../components/ComplianceCalendar", () => ({ ComplianceCalendar: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

afterEach(() => vi.unstubAllGlobals());

function event(state: CalendarEvent["state"], day: number) {
  return calendarEventSchema.parse({
    id: `${state}:${day}`,
    date: `2026-11-${String(day).padStart(2, "0")}`,
    kind: "rbi_deadline",
    title: `${{ overdue: "Overdue", upcoming: "Upcoming", past: "Past" }[state]}: invoice ${day}`,
    state,
    href: `/invoices#invoice-${state}-${day}`,
    ruleId: "RBI_REALISATION",
  });
}

it("server-renders all overdue and only the first ten upcoming links in date order", async () => {
  const events = [
    ...Array.from({ length: 12 }, (_, i) => event("upcoming", 12 - i)),
    event("past", 1),
    event("overdue", 3),
    event("overdue", 1),
    event("overdue", 2),
  ];
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(events));
  vi.stubGlobal("fetch", fetcher);
  const html = renderToStaticMarkup(await Calendar());
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(new URL("http://localhost:3001/calendar"), {
    headers: { cookie: "session=test" },
    cache: "no-store",
  });
  expect(html).toContain('aria-label="Calendar legend"');
  for (const state of ["Overdue", "Upcoming", "Past"]) expect(html).toContain(`>${state}</li>`);
  for (const item of events.filter((item) => item.state === "overdue")) {
    expect(html).toContain(`href="${item.href}"`);
  }
  for (let day = 1; day <= 10; day++) {
    expect(html).toContain(`href="/invoices#invoice-upcoming-${day}"`);
  }
  expect(html).not.toContain('href="/invoices#invoice-upcoming-11"');
  expect(html).not.toContain('href="/invoices#invoice-upcoming-12"');
  expect(html).not.toContain('href="/invoices#invoice-past-1"');
  expect(html.indexOf("Overdue: invoice 1")).toBeLessThan(html.indexOf("Overdue: invoice 3"));
  expect(html.indexOf("Upcoming: invoice 1")).toBeLessThan(html.indexOf("Upcoming: invoice 9"));
  expect(html).toContain('<time dateTime="2026-11-01">2026-11-01</time>');
});

it("renders the empty fallback without JavaScript", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([])));
  expect(renderToStaticMarkup(await Calendar())).toContain("No overdue or upcoming deadlines.");
});

it("rejects invalid API events", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([{ ...event("upcoming", 1), date: "invalid" }])),
  );
  await expect(Calendar()).rejects.toThrow();
});

it("redirects an unauthenticated request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
  );
  await expect(Calendar()).rejects.toThrow("redirect:/login");
});
