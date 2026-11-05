import { getConnInfo } from "@hono/node-server/conninfo";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { readAnySession, readSession } from "./auth/session";
import type { AppDeps } from "./routes/auth";

export const RATE_LIMITS = {
  auth: { windowMs: 60_000, max: 10 },
  ai: { windowMs: 60_000, max: 6 },
  share: { windowMs: 3_600_000, max: 10 },
} as const;

const routeGroups: Readonly<Record<string, keyof typeof RATE_LIMITS>> = {
  "/auth/login": "auth",
  "/auth/signup": "auth",
  "/auth/ca/login": "auth",
  "/auth/ca/signup": "auth",
  "/auth/judge": "auth",
  "/dashboard/turn": "ai",
  "/extract": "ai",
  "/close": "ai",
  "/ca-link": "share",
};
const ipSchema = z.union([z.ipv4(), z.ipv6()]);

export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  // shortcut: in-memory per instance; move to Postgres or Redis if the API runs more than one instance.
  const windows = new Map<string, { resetAt: number; count: number }>();
  let cleanupAt = 0;
  return (key: string, now: number): boolean => {
    if (now >= cleanupAt) {
      for (const [key, window] of windows) {
        if (now >= window.resetAt) windows.delete(key);
      }
      cleanupAt = now + windowMs;
    }
    let window = windows.get(key);
    if (!window || now >= window.resetAt) {
      window = { resetAt: now + windowMs, count: 0 };
      windows.set(key, window);
    }
    if (window.count >= max) return false;
    window.count += 1;
    return true;
  };
}

export function rateLimitMiddleware(
  deps: Pick<AppDeps, "rateLimits" | "sessionSecret" | "trustRenderProxy">,
): MiddlewareHandler {
  return async (c, next) => {
    const group = routeGroups[c.req.path];
    if (!deps.rateLimits || c.req.method !== "POST" || !group) return next();
    const userId =
      group === "auth"
        ? undefined
        : c.req.path === "/dashboard/turn"
          ? (await readAnySession(c, deps.sessionSecret))?.userId
          : await readSession(c, deps.sessionSecret);
    if (group !== "auth" && !userId) return next();
    // Render overwrites this header; Next preserves it over the workspace-private network.
    const forwarded = ipSchema.safeParse(
      deps.trustRenderProxy ? c.req.header("cf-connecting-ip") : undefined,
    );
    const connection = forwarded.success
      ? forwarded
      : ipSchema.safeParse(c.env ? getConnInfo(c).remote.address : undefined);
    const ip = connection.success ? connection.data : "unknown";
    const key = `${group}:${ip}${userId ? `:${userId}` : ""}`;
    if (!deps.rateLimits[group](key, Date.now())) {
      c.header("Retry-After", String(Math.ceil(RATE_LIMITS[group].windowMs / 1000)));
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  };
}
