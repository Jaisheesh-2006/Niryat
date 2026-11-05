import { caDashboardSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { CaDashboard } from "../../../components/CaDashboard";
import { apiGet } from "../../../lib/api";
import CaClients from "./page";

vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("../../../components/CaDashboard", () => ({
  CaDashboard: vi.fn(() => <div data-ca-dashboard="true" />),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const row = {
  linkId: "10000000-0000-4000-8000-000000000001",
  freelancerId: "20000000-0000-4000-8000-000000000001",
  name: "Ananya Rao",
  email: "owner@example.com",
  sharedSince: "2026-11-01T00:00:00.000Z",
  healthScore: 80,
  unpaidCount: 2,
  overdueCount: 1,
  nextDeadline: { date: "2026-11-11", title: "GSTR-1 due" },
  firaMissingCount: 3,
  pendingApprovals: 4,
};
const dashboard = (portfolio: unknown[]) =>
  caDashboardSchema.parse({
    asOf: "2026-11-05",
    financialYear: "2026-27",
    portfolio,
    invoices: [],
    payments: [],
  });

it("lists clients in the API's order with links to their read-only views", async () => {
  vi.mocked(apiGet).mockResolvedValueOnce(
    dashboard([
      row,
      {
        ...row,
        linkId: "10000000-0000-4000-8000-000000000002",
        freelancerId: "20000000-0000-4000-8000-000000000002",
        name: null,
        email: "other@example.com",
        healthScore: null,
        nextDeadline: null,
      },
    ]),
  );
  const html = renderToStaticMarkup(await CaClients());
  expect(apiGet).toHaveBeenCalledExactlyOnceWith("/ca/dashboard", caDashboardSchema, "/ca/login");
  expect(html).toContain('data-ca-dashboard="true"');
  expect(html).toContain(`<a href="/ca/clients/${row.freelancerId}">Ananya Rao</a>`);
  expect(html).toContain(
    '<a href="/ca/clients/20000000-0000-4000-8000-000000000002">other@example.com</a>',
  );
  expect(html.indexOf("Ananya Rao")).toBeLessThan(html.indexOf("other@example.com"));
  expect(html).toContain('<time dateTime="2026-11-11">11 Nov 2026</time>: GSTR-1 due');
  expect(html).toContain("Profile not complete");
  expect(html).not.toMatch(/<(form|button|input)\b/);
});

it("points to requests when no client has shared yet", async () => {
  vi.mocked(apiGet).mockResolvedValueOnce(dashboard([]));
  const html = renderToStaticMarkup(await CaClients());
  expect(html).toContain("No clients yet");
  expect(html).toContain('<a href="/ca/requests">Accept a request</a>');
  expect(html).not.toContain("<table");
  expect(html).not.toContain('data-ca-dashboard="true"');
});

it("reports an unavailable portfolio instead of inventing an empty list", async () => {
  vi.mocked(apiGet).mockResolvedValueOnce(null);
  await expect(CaClients()).rejects.toThrow("CA portfolio unavailable");
});

it.each([undefined, "synthetic-studio-key"])(
  "passes the validated dashboard and licence (%s) to Studio",
  async (licenseKey) => {
    vi.stubEnv("AG_STUDIO_LICENSE_KEY", licenseKey);
    const data = dashboard([row]);
    vi.mocked(apiGet).mockResolvedValueOnce(data);
    renderToStaticMarkup(await CaClients());
    expect(vi.mocked(CaDashboard).mock.calls[0]?.[0]).toEqual({ dashboard: data, licenseKey });
  },
);
