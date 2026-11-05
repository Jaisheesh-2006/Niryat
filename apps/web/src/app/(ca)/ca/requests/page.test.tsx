import { caRequestsSchema, sessionUserSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { apiGet } from "../../../../lib/api";
import CaRequests from "./page";

vi.mock("../../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.clearAllMocks());
const me = { id: "10000000-0000-4000-8000-000000000001", email: "ca@example.com", role: "ca" };

it("uses the CA login destination and shows its email in the exact empty state", async () => {
  vi.mocked(apiGet).mockResolvedValueOnce([]).mockResolvedValueOnce(me);
  const html = renderToStaticMarkup(await CaRequests());
  expect(apiGet).toHaveBeenNthCalledWith(1, "/ca/requests", caRequestsSchema, "/ca/login");
  expect(apiGet).toHaveBeenNthCalledWith(2, "/auth/me", sessionUserSchema, "/ca/login");
  expect(html).toContain("Client requests</h1>");
  expect(html).toContain("Open an invitation</h2>");
  expect(html).toContain("Ask your client to send you their invitation code privately.");
  expect(html).toContain(
    "No requests. Ask your client to add your email (ca@example.com) in Niryat under Profile → Your CA.",
  );
  expect(html).not.toContain(">Accept</button>");
});

it("renders names or email fallbacks, India request dates and both response actions", async () => {
  vi.mocked(apiGet)
    .mockResolvedValueOnce([
      {
        id: me.id,
        freelancerName: "Ananya Rao",
        freelancerEmail: "owner@example.com",
        createdAt: "2026-11-04T19:00:00.000Z",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        freelancerName: null,
        freelancerEmail: "other@example.com",
        createdAt: "2026-11-04T19:00:00.000Z",
      },
    ])
    .mockResolvedValueOnce(me);
  const html = renderToStaticMarkup(await CaRequests());
  expect(html).toContain("Ananya Rao</h2>");
  expect(html).toContain("owner@example.com</p>");
  expect(html).toContain("other@example.com</h2>");
  expect(html).toContain('<time dateTime="2026-11-04T19:00:00.000Z">5 Nov 2026</time>');
  expect(html.match(/>Accept<\/button>/g)).toHaveLength(2);
  expect(html.match(/>Decline<\/button>/g)).toHaveLength(2);
});

it("reports an unavailable requests service instead of inventing an empty list", async () => {
  vi.mocked(apiGet).mockResolvedValueOnce(null).mockResolvedValueOnce(me);
  await expect(CaRequests()).rejects.toThrow("CA requests unavailable");
});
