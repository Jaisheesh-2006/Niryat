import { randomBytes, randomUUID } from "node:crypto";
import { createDb } from "@niryat/db";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "./auth/testing";
import { createApp } from "./index";
import { createRateLimiter, RATE_LIMITS } from "./rate-limit";
import type { AppDeps } from "./routes/auth";

describe("fixed-window limiter", () => {
  it("allows max requests, rejects through the boundary, then resets", () => {
    const allow = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(allow("a", 100)).toBe(true);
    expect(allow("a", 101)).toBe(true);
    expect(allow("a", 1099)).toBe(false);
    expect(allow("a", 1100)).toBe(true);
    expect(allow("a", 1101)).toBe(true);
    expect(allow("a", 1102)).toBe(false);
    expect(allow("a", 5000)).toBe(true);
  });

  it("keeps keys and instances independent, with each key's own window", () => {
    const allow = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(allow("a", 100)).toBe(true);
    expect(allow("b", 500)).toBe(true);
    expect(allow("a", 1100)).toBe(true);
    expect(allow("b", 1100)).toBe(false);
    expect(allow("b", 1500)).toBe(true);
    expect(createRateLimiter({ windowMs: 1000, max: 1 })("a", 1100)).toBe(true);
  });
});

describe("route rate limits", () => {
  const database = createDb("postgresql://unused:unused@localhost:1/unused");
  const base: AppDeps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  afterAll(() => database.close());
  afterEach(() => vi.restoreAllMocks());

  function limitedApp(trustRenderProxy = false) {
    return createApp({
      ...base,
      trustRenderProxy,
      rateLimits: {
        auth: createRateLimiter(RATE_LIMITS.auth),
        ai: createRateLimiter(RATE_LIMITS.ai),
        share: createRateLimiter(RATE_LIMITS.share),
      },
    });
  }

  function post(
    app: ReturnType<typeof createApp>,
    path = "/auth/login",
    ip = "192.0.2.1",
    cookie = "",
  ) {
    return app.request(
      path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip, Cookie: cookie },
        body: "null",
      },
      { incoming: { socket: { remoteAddress: ip } } },
    );
  }

  it("rejects the eleventh login, isolates IPs, and resets after a minute", async () => {
    const time = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const app = limitedApp();
    for (let i = 0; i < 10; i++) expect((await post(app)).status).toBe(400);
    const blocked = await post(app);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect((await post(app, "/auth/login", "192.0.2.2")).status).toBe(400);
    time.mockReturnValue(1_059_999);
    expect((await post(app)).status).toBe(429);
    time.mockReturnValue(1_060_000);
    expect((await post(app)).status).toBe(400);
  });

  it("shares the auth budget across signup, login and reserved CA/judge paths", async () => {
    const app = limitedApp();
    for (let i = 0; i < 10; i++) expect((await post(app, "/auth/signup")).status).toBe(400);
    for (const path of [
      "/auth/login",
      "/auth/signup",
      "/auth/ca/login",
      "/auth/ca/signup",
      "/auth/judge",
    ]) {
      expect((await post(app, path)).status).toBe(429);
    }
    expect((await post(app, "/auth/logout")).status).toBe(204);
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/close")).status).toBe(401);
    expect((await app.request("/auth/login")).status).toBe(404);
  });

  it.each([
    { path: "/auth/login", max: 10 },
    { path: "/extract", max: 6 },
    { path: "/ca-link", max: 10 },
  ])("ignores forged forwarding headers for $path outside Render", async ({ path, max }) => {
    const app = limitedApp();
    const cookie = await cookieFor(randomUUID(), base.sessionSecret);
    app.post("/ca-link", (c) => c.json({ error: "invalid_request" }, 400));
    for (let i = 0; i <= max; i++) {
      const response = await app.request(
        path,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": `192.0.2.${i}, 198.51.100.1`,
            "cf-connecting-ip": `192.0.2.${i}`,
            Cookie: cookie,
          },
          body: "null",
        },
        { incoming: { socket: { remoteAddress: "198.51.100.1" } } },
      );
      expect(response.status).toBe(i < max ? 400 : 429);
    }
  });

  it("uses Render's protected IP across private proxy hops, ignoring forged X-Forwarded-For", async () => {
    const app = limitedApp(true);
    const request = (clientIp: string, forwarded: string, socketIp: string) =>
      app.request(
        "/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": clientIp,
            "x-forwarded-for": forwarded,
          },
          body: "null",
        },
        { incoming: { socket: { remoteAddress: socketIp } } },
      );
    for (let i = 0; i < 10; i++) {
      expect((await request("192.0.2.1", `203.0.113.${i}, 192.0.2.1`, "10.0.0.1")).status).toBe(
        400,
      );
    }
    expect((await request("192.0.2.1", "203.0.113.99, 192.0.2.1", "10.0.0.2")).status).toBe(429);
    expect((await request("192.0.2.2", "203.0.113.99, 192.0.2.2", "10.0.0.1")).status).toBe(400);
  });

  it("falls back to the connection address when Render's IP is missing or invalid", async () => {
    const app = limitedApp(true);
    const request = (ip: string, forwarded?: string) =>
      app.request(
        "/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "192.0.2.99, 198.51.100.1",
            ...(forwarded === undefined ? {} : { "cf-connecting-ip": forwarded }),
          },
          body: "null",
        },
        { incoming: { socket: { remoteAddress: ip } } },
      );
    for (let i = 0; i < 10; i++) expect((await request("::1")).status).toBe(400);
    expect((await request("::1")).status).toBe(429);
    expect((await request("::1", "invalid, 192.0.2.2")).status).toBe(429);
    expect((await request("::2")).status).toBe(400);
    expect((await request("::1", "192.0.2.2")).status).toBe(400);
  });

  it("leaves requests unlimited when the dependency is absent", async () => {
    const app = createApp(base);
    for (let i = 0; i < 12; i++) {
      const response = await post(app);
      expect(response.status).toBe(400);
      expect(response.headers.has("Retry-After")).toBe(false);
    }
  });

  it("shares six AI requests per IP/user, keeping other users and auth independent", async () => {
    const app = limitedApp();
    const cookie = await cookieFor(randomUUID(), base.sessionSecret);
    const otherCookie = await cookieFor(randomUUID(), base.sessionSecret);
    for (const path of ["/extract", "/close", "/dashboard/turn"]) {
      for (let i = 0; i < 2; i++) {
        expect((await post(app, path, "192.0.2.1", cookie)).status).toBe(
          path === "/dashboard/turn" ? 503 : 400,
        );
      }
    }
    for (const path of ["/extract", "/close", "/dashboard/turn"]) {
      const blocked = await post(app, path, "192.0.2.1", cookie);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("Retry-After")).toBe("60");
      expect((await post(app, path, "192.0.2.1", otherCookie)).status).not.toBe(429);
      expect((await post(app, path)).status).toBe(401);
      expect((await post(app, path, "192.0.2.1", `${cookie}tampered`)).status).toBe(401);
    }
    expect((await post(app, "/extract", "192.0.2.2", cookie)).status).toBe(400);
    expect((await post(app)).status).toBe(400);
  });

  it("reserves an independent ten-per-hour share budget for each IP/user", async () => {
    const app = limitedApp();
    const cookie = await cookieFor(randomUUID(), base.sessionSecret);
    const otherCookie = await cookieFor(randomUUID(), base.sessionSecret);
    const time = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    const start = Date.now();
    // The share handler belongs to B3; this stub checks A2's middleware only.
    app.post("/ca-link", (c) => c.body(null, 204));
    for (let i = 0; i < 10; i++) {
      expect((await post(app, "/ca-link", "192.0.2.1", cookie)).status).toBe(204);
    }
    const blocked = await post(app, "/ca-link", "192.0.2.1", cookie);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("3600");
    expect((await post(app, "/ca-link", "192.0.2.1", otherCookie)).status).toBe(204);
    expect((await post(app, "/extract", "192.0.2.1", cookie)).status).toBe(400);
    time.mockReturnValue(start + 3_599_999);
    expect((await post(app, "/ca-link", "192.0.2.1", cookie)).status).toBe(429);
    time.mockReturnValue(start + 3_600_000);
    expect((await post(app, "/ca-link", "192.0.2.1", cookie)).status).toBe(204);
  });
});
