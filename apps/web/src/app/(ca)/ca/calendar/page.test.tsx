import { type CaCalendarEvent, caCalendarSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import CaCalendar from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=ca" }) }));
vi.mock("../../../../lib/env", () => ({ apiUrl: "http://localhost:3001" }));
vi.mock("../../../../components/CaCalendarView", () => ({ CaCalendarView: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
afterEach(() => vi.unstubAllGlobals());

const clients = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Ananya <client>" },
  { id: "20000000-0000-4000-8000-000000000002", name: "Second client" },
];
function event(state: CaCalendarEvent["state"], day: number, index = 0): CaCalendarEvent {
  const client = clients[index];
  if (!client) throw new Error("Expected client");
  return {
    id: `${client.id}:${state}:${day}`,
    freelancerId: client.id,
    date: `2026-11-${String(day).padStart(2, "0")}`,
    kind: "rbi_deadline",
    title: `${state} deadline ${day} for ${index}`,
    state,
    href: `/ca/clients/${client.id}`,
    action: "Follow up with your client for payment.",
    source: "RBI source",
    ruleId: "RBI_REALISATION",
  };
}

it("server-renders all overdue and the next ten upcoming across clients with names, actions and links", async () => {
  const events = [
    ...Array.from({ length: 12 }, (_, i) => event("upcoming", 12 - i, i % 2)),
    event("overdue", 5, 1),
    event("past", 1),
    event("overdue", 2),
    event("overdue", 1, 1),
  ];
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(caCalendarSchema.parse({ clients, events })));
  vi.stubGlobal("fetch", fetcher);
  const html = renderToStaticMarkup(await CaCalendar());
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(new URL("http://localhost:3001/ca/calendar"), {
    headers: { cookie: "session=ca" },
    cache: "no-store",
  });
  expect(html).toContain("Ananya &lt;client&gt;");
  expect(html).toContain("Second client");
  for (const item of events.filter(
    (item) => item.state === "overdue" || (item.state === "upcoming" && item.date <= "2026-11-10"),
  )) {
    expect(html).toContain(`<a href="${item.href}">${item.title}</a><p>${item.action}</p>`);
  }
  for (const title of ["past deadline", "upcoming deadline 11", "upcoming deadline 12"])
    expect(html).not.toContain(title);
  expect(html.indexOf("overdue deadline 1")).toBeLessThan(html.indexOf("overdue deadline 2"));
  expect(html.indexOf("overdue deadline 5")).toBeLessThan(html.indexOf("upcoming deadline 1"));
  expect(html.indexOf("upcoming deadline 1")).toBeLessThan(html.indexOf("upcoming deadline 9"));
  expect(html.match(/<time /g)).toHaveLength(13);
  expect(html).toContain('<time dateTime="2026-11-01">1 Nov 2026</time>');
});

it("shows an honest empty calendar without JavaScript", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ clients: [], events: [] })),
  );
  const html = renderToStaticMarkup(await CaCalendar());
  expect(html).toContain("No clients are sharing records with you yet.");
  expect(html).toContain("No overdue or upcoming deadlines.");
});

it("rejects invalid event metadata", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ clients, events: [{ ...event("upcoming", 1), freelancerId: "invalid" }] }),
      ),
  );
  await expect(CaCalendar()).rejects.toThrow();
});

it("redirects unauthenticated callers to CA sign-in", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
  );
  await expect(CaCalendar()).rejects.toThrow("redirect:/ca/login");
});
