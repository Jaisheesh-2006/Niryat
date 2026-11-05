import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { apiGet } from "../lib/api";
import { SyncFreshness } from "./SyncFreshness";

vi.mock("../lib/api", () => ({ apiGet: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("shows relative freshness with an absolute IST timestamp", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:10:00Z"));
  vi.mocked(apiGet).mockResolvedValue({
    lastSuccessAt: "2026-11-05T12:00:00Z",
    lastStatus: "ok",
    stale: false,
  });
  const html = renderToStaticMarkup(await SyncFreshness());
  expect(html).toContain("PayPal data last updated");
  expect(html).toContain("10 minutes ago");
  expect(html).toContain("17:30 IST");
  expect(html).toContain('dateTime="2026-11-05T12:00:00Z"');
});

it.each([null, "2026-11-05T12:00:00Z"])(
  "warns about stale data and failed syncs (%s)",
  async (lastSuccessAt) => {
    vi.mocked(apiGet).mockResolvedValue({ lastSuccessAt, lastStatus: "failed", stale: true });
    const html = renderToStaticMarkup(await SyncFreshness());
    expect(html).toContain("PayPal data may be out of date (last update");
    expect(html).toContain(lastSuccessAt ? "17:30 IST" : "never");
    expect(html).toContain("New payments or disputes may not show yet.");
    expect(html).toContain("The latest PayPal sync failed.");
  },
);

it("does not imply fresh data when the API is unavailable", async () => {
  vi.mocked(apiGet).mockResolvedValue(null);
  expect(renderToStaticMarkup(await SyncFreshness())).toContain(
    "PayPal data freshness is unavailable.",
  );
});
