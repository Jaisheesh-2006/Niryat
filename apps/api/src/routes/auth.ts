import { randomUUID } from "node:crypto";
import type { DashboardLlm } from "@niryat/agent";
import {
  createUser,
  type Db,
  findJudgeUser,
  findUserByEmail,
  findUserById,
  signInWithPayPal,
} from "@niryat/db";
import type { PayPalLedger, PayPalLogin, PayPalRestClient } from "@niryat/paypal";
import {
  credentialsSchema,
  judgeLoginSchema,
  type ManualCloseInput,
  type UserRole,
} from "@niryat/shared";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password";
import { endSession, readAnySession, startSession } from "../auth/session";
import type { CloseDeps } from "../close";
import type { FileStore } from "../files";
import type { createRateLimiter, RATE_LIMITS } from "../rate-limit";

export interface AppDeps {
  db: Db;
  encryptionKey: Buffer;
  sessionSecret: string;
  secureCookies: boolean;
  judgeMode?: boolean;
  rateLimits?: Record<keyof typeof RATE_LIMITS, ReturnType<typeof createRateLimiter>>;
  trustRenderProxy?: boolean;
  paypal?: { rest: PayPalRestClient; ledger: PayPalLedger; webhookId: string };
  paypalLogin?: PayPalLogin;
  files?: FileStore;
  publicAppUrl?: string;
  ai?: NonNullable<CloseDeps["ai"]> & { dashboard: DashboardLlm };
  runInBackground?: (work: () => Promise<void>) => void | Promise<void>;
  dispatchMonthlyClose?: (input: ManualCloseInput) => Promise<void>;
}

const dummyHash = `scrypt$16384$8$1$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`;
const PAYPAL_STATE_COOKIE = "niryat_paypal_state";
const stateCookieSchema = z.tuple([z.uuid(), z.coerce.number().int().positive()]);
const callbackSchema = z.object({ state: z.uuid(), code: z.string().min(1).max(4096) });

export function authRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  const appUrl = deps.publicAppUrl ?? "http://localhost:3000";
  routes.get("/auth/paypal/start", async (c) => {
    if (!deps.paypalLogin) return c.redirect(`${appUrl}/login?error=paypal_unavailable`, 302);
    const state = randomUUID();
    await setSignedCookie(c, PAYPAL_STATE_COOKIE, `${state}.${Date.now()}`, deps.sessionSecret, {
      httpOnly: true,
      sameSite: "Lax",
      secure: deps.secureCookies,
      maxAge: 600,
      path: "/",
    });
    return c.redirect(deps.paypalLogin.authorizeUrl(state), 302);
  });
  routes.get("/auth/paypal/callback", async (c) => {
    const cookie = await getSignedCookie(c, deps.sessionSecret, PAYPAL_STATE_COOKIE).catch(
      () => undefined,
    );
    deleteCookie(c, PAYPAL_STATE_COOKIE, { path: "/" });
    const saved = stateCookieSchema.safeParse(cookie ? cookie.split(".") : undefined);
    const query = callbackSchema.safeParse(c.req.query());
    if (
      !saved.success ||
      !query.success ||
      saved.data[0] !== query.data.state ||
      Date.now() - saved.data[1] < 0 ||
      Date.now() - saved.data[1] > 600_000 ||
      c.req.query("error") !== undefined
    ) {
      return c.redirect(`${appUrl}/login?error=paypal_cancelled`, 302);
    }
    if (!deps.paypalLogin) return c.redirect(`${appUrl}/login?error=paypal_unavailable`, 302);
    try {
      const identity = await deps.paypalLogin.identify(query.data.code);
      if (!identity.ok) return c.redirect(`${appUrl}/login?error=paypal_failed`, 302);
      const result = await signInWithPayPal(deps.db, identity);
      if (!result.ok) return c.redirect(`${appUrl}/login?error=${result.reason}`, 302);
      await startSession(c, result.user.id, "freelancer", deps.sessionSecret, deps.secureCookies);
      return c.redirect(`${appUrl}/overview`, 302);
    } catch {
      console.error("PayPal sign-in unavailable");
      return c.redirect(`${appUrl}/login?error=paypal_unavailable`, 302);
    }
  });
  routes.post("/auth/judge", async (c) => {
    if (!deps.judgeMode) return c.json({ error: "not_found" }, 404);
    if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    const parsed = judgeLoginSchema.safeParse(await c.req.json<unknown>().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const user = await findJudgeUser(deps.db, parsed.data.as);
    if (!user) return c.json({ error: "judge_unavailable" }, 503);
    await startSession(c, user.id, user.role, deps.sessionSecret, deps.secureCookies);
    return c.json(user);
  });
  routes.use("*", async (c, next) => {
    if (
      c.req.method === "POST" &&
      c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
    ) {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    await next();
  });

  function registerPortal(role: UserRole) {
    const prefix = role === "ca" ? "/auth/ca" : "/auth";
    for (const action of ["signup", "login"] as const) {
      routes.post(`${prefix}/${action}`, async (c) => {
        const body = await c.req.json<unknown>().catch(() => undefined);
        const parsed = credentialsSchema.safeParse(body);
        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
          return c.json({ error: "invalid_request", fields }, 400);
        }
        const { email, password } = parsed.data;
        if (action === "signup") {
          const user = await createUser(deps.db, {
            email,
            passwordHash: await hashPassword(password),
            role,
          });
          if (!user) return c.json({ error: "email_taken" }, 409);
          await startSession(c, user.id, role, deps.sessionSecret, deps.secureCookies);
          return c.json(user, 201);
        }
        const user = await findUserByEmail(deps.db, email);
        const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
        if (!user || !valid) return c.json({ error: "invalid_credentials" }, 401);
        if (user.role !== role) return c.json({ error: "wrong_portal", portal: user.role }, 403);
        await startSession(c, user.id, user.role, deps.sessionSecret, deps.secureCookies);
        return c.json({ id: user.id, email: user.email });
      });
    }
  }
  registerPortal("freelancer");
  registerPortal("ca");

  routes.post("/auth/logout", (c) => {
    endSession(c);
    return c.body(null, 204);
  });
  routes.get("/auth/me", async (c) => {
    const session = await readAnySession(c, deps.sessionSecret);
    const user = session ? await findUserById(deps.db, session.userId) : undefined;
    return user ? c.json(user) : c.json({ error: "unauthenticated" }, 401);
  });
  return routes;
}
