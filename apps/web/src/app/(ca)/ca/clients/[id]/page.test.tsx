import { gstr1PreviewSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiGet } from "../../../../../lib/api";
import CaClient from "./page";

vi.mock("../../../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("../../../../../lib/env", () => ({ apiUrl: "http://localhost:3001" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=ca" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const id = "20000000-0000-4000-8000-000000000001";
const row = {
  linkId: "10000000-0000-4000-8000-000000000001",
  freelancerId: id,
  name: "Ananya Rao",
  email: "owner@example.com",
  sharedSince: "2026-11-01T00:00:00.000Z",
  healthScore: 80,
  unpaidCount: 1,
  overdueCount: 0,
  nextDeadline: null,
  firaMissingCount: 0,
  pendingApprovals: 2,
};
const citation = { ruleId: "RULE_1", source: "Source citation", effectiveFrom: null };
const health = {
  score: 80,
  checkedOn: "2026-11-01",
  suggestion: null,
  flags: [
    {
      code: "purpose_code",
      severity: "low",
      message: "Purpose code missing",
      citation,
      note: "Verify with your CA.",
    },
    {
      code: "lut_expiring",
      severity: "high",
      message: "LUT ends soon",
      citation,
      note: "Verify with your CA.",
    },
  ],
};
const invoice = {
  id: "30000000-0000-4000-8000-000000000001",
  clientId: "40000000-0000-4000-8000-000000000001",
  clientName: "Buyer Ltd",
  type: "one_time",
  number: "2026-27/0001",
  fy: "2026-27",
  date: "2026-10-15",
  currency: "USD",
  amount: "100.00",
  description: "Software",
  sac: "998314",
  recurrence: null,
  status: "sent",
  paypalInvoiceId: null,
  paypalRecurringSeriesId: null,
  paidTotal: "0.00",
  payments: [],
  firaStatus: "pending",
  refundedTotal: "0.00",
  refunds: [],
  disputes: [],
  compliance: {
    realisation: {
      exportValue: "100.00",
      received: "0.00",
      shortfall: "100.00",
      adjustment: "none",
      message: null,
      citation,
    },
    deadline: null,
    creditNotes: [],
    disputeAlerts: [],
  },
};
const event = {
  id: "gstr1-2026-10",
  date: "2026-11-11",
  kind: "gstr1_due",
  title: "GSTR-1 due",
  action: "Ask your CA to file GSTR-1.",
  source: "GST source",
  ruleId: "GSTR1_6A",
  state: "upcoming",
  href: "/gstr1",
};
const preview = gstr1PreviewSchema.parse({
  period: "2026-10",
  frequency: "monthly",
  label: "October 2026",
  start: "2026-10-01",
  end: "2026-10-31",
  dueDate: "2026-11-11",
  periods: [
    "2026-10",
    "2026-09",
    "2026-08",
    "2026-07",
    "2026-06",
    "2026-05",
    "2026-04",
    "2026-03",
  ].map((period) => ({ period, label: period === "2026-10" ? "October 2026" : period })),
  invoices: [{ ...invoice, invoiceId: invoice.id, status: "sent", lutCovered: true }],
  refunds: [],
  totals: [{ currency: "USD", invoices: "100.00", refunds: "0.00", net: "100.00" }],
  citation,
});
const fetcher = vi.fn<typeof fetch>();

function mockApi(responses: Record<string, unknown>) {
  vi.mocked(apiGet).mockImplementation(async (path) => responses[path.split("?")[0] ?? ""] ?? null);
}
function render(searchParams: Record<string, string> = {}) {
  return CaClient({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  fetcher.mockReset().mockResolvedValue(Response.json(preview));
  vi.stubGlobal("fetch", fetcher);
  mockApi({
    "/ca/portfolio": [row],
    "/invoices": [invoice],
    "/health-check": health,
    "/calendar": [event],
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("reads every section for this client and renders only the allowed controls", async () => {
  const html = renderToStaticMarkup(await render({ period: "2026-10" }));
  for (const path of ["/invoices", "/health-check", "/calendar"])
    expect(apiGet).toHaveBeenCalledWith(`${path}?client=${id}`, expect.anything(), "/ca/login");
  expect(fetcher.mock.calls[0]?.[0]).toEqual(
    new URL(`http://localhost:3001/gstr1?client=${id}&period=2026-10`),
  );
  expect(html).toContain("Ananya Rao</h1>");
  expect(html).toContain("80 / 100");
  expect(html).toContain('Rule <span class="mono">RULE_1</span>: Source citation');
  expect(html.indexOf("LUT ends soon")).toBeLessThan(html.indexOf("Purpose code missing"));
  expect(html).toContain("Buyer Ltd");
  expect(html).toContain("Sent through PayPal");
  expect(html).toContain("GSTR-1 due");
  expect(html).toContain("October 2026");
  expect(html).toContain("Waiting for your client to approve in Niryat.");
  expect(html).not.toContain('href="/gstr1"');
  const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(([, text]) => text);
  expect(buttons).toEqual([
    "Stop managing this client",
    "Show period",
    "Download export sales file (GSTR-1 Table 6A)",
  ]);
  const forms = html.match(/<form[^>]*>/g) ?? [];
  expect(forms).toEqual([
    expect.stringContaining('method="get"'),
    expect.stringContaining('method="post"'),
  ]);
});

it("shows the no-access message without reading records when the client is not shared", async () => {
  mockApi({ "/ca/portfolio": [] });
  const html = renderToStaticMarkup(await render());
  expect(html).toContain("You no longer have access to this client.");
  expect(html).toContain('<a href="/ca">');
  expect(apiGet).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
});

it("shows the no-access message when sharing ends between reads", async () => {
  mockApi({ "/ca/portfolio": [row], "/calendar": [event] });
  fetcher.mockResolvedValue(Response.json({ error: "not_found" }, { status: 404 }));
  const html = renderToStaticMarkup(await render());
  expect(html).toContain("You no longer have access to this client.");
  expect(html).not.toContain("<button");
});

it("explains a missing client profile in the health and GSTR-1 sections", async () => {
  mockApi({ "/ca/portfolio": [row], "/invoices": [], "/calendar": [] });
  fetcher.mockResolvedValue(Response.json({ error: "not_found" }, { status: 404 }));
  const html = renderToStaticMarkup(await render());
  expect(html.match(/Your client hasn&#x27;t completed their profile yet\./g)).toHaveLength(2);
  expect(html).toContain("No invoices yet.");
});

it("sends a CA to the CA sign-in page when the GSTR-1 read is unauthenticated", async () => {
  fetcher.mockResolvedValue(Response.json({ error: "unauthenticated" }, { status: 401 }));
  await expect(render()).rejects.toThrow("redirect:/ca/login");
});
