import { caLinkResponseSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { apiGet } from "../../../lib/api";
import Profile from "./page";

vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.clearAllMocks());

it("fetches sharing separately from a missing profile and shows the CA card", async () => {
  vi.mocked(apiGet)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ codes: [] })
    .mockResolvedValueOnce({ link: null });
  const html = renderToStaticMarkup(await Profile());
  expect(apiGet).toHaveBeenNthCalledWith(3, "/ca-link", caLinkResponseSchema);
  expect(html).toContain("Compliance profile</h1>");
  expect(html).toContain("Share your records with your CA");
  expect(html).toContain("Send request</button>");
});

it("does not show a new-request form when sharing data is unavailable", async () => {
  vi.mocked(apiGet)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ codes: [] })
    .mockResolvedValueOnce(null);
  await expect(Profile()).rejects.toThrow("CA link unavailable");
});
