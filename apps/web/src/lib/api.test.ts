import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiGet } from "./api";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "niryat_session=test" })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("./env", () => ({ apiUrl: "http://localhost:3001" }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each([undefined, "/ca/login"])("redirects a 401 to loginPath %s", async (loginPath) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  await expect(apiGet("/auth/me", z.object({}), loginPath)).rejects.toThrow(
    `redirect:${loginPath ?? "/login"}`,
  );
  expect(redirect).toHaveBeenCalledExactlyOnceWith(loginPath ?? "/login");
});

it("forwards cookies without caching and validates the response", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ name: "CA" }));
  vi.stubGlobal("fetch", fetch);
  expect(await apiGet("/auth/me", z.object({ name: z.string() }), "/ca/login")).toEqual({
    name: "CA",
  });
  expect(headers).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(new URL("http://localhost:3001/auth/me"), {
    headers: { cookie: "niryat_session=test" },
    cache: "no-store",
  });
});
