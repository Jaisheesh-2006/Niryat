import { randomBytes, randomUUID } from "node:crypto";
import { createDb, createUser, findUserByEmail } from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import type { PayPalLogin } from "@niryat/paypal";
import { sessionUserSchema, userRoles } from "@niryat/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as passwords from "../auth/password";
import { createApp } from "../index";

describe("PayPal callback validation", () => {
  const database = createDb("postgresql://unused:unused@localhost:1/unused");
  const identify = vi.fn<PayPalLogin["identify"]>();
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: true,
    publicAppUrl: "https://niryat.example",
    paypalLogin: {
      authorizeUrl: (state: string) => `https://www.sandbox.paypal.com/connect?state=${state}`,
      identify,
    },
  };
  const app = createApp(deps);
  beforeEach(() => {
    identify.mockReset();
  });
  afterAll(() => database.close());

  async function start() {
    const response = await app.request("/auth/paypal/start");
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    const state = new URL(response.headers.get("location") ?? "").searchParams.get("state");
    if (!cookie || !state) throw new Error("Expected OAuth state");
    return { response, cookie, state };
  }

  it("starts at sandbox with a signed, HttpOnly, ten-minute state cookie", async () => {
    const { response, cookie, state } = await start();
    expect(response.status).toBe(302);
    expect(cookie).toMatch(/^niryat_paypal_state=/);
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("HttpOnly"));
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("SameSite=Lax"));
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("Max-Age=600"));
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("Secure"));
    expect(response.headers.get("set-cookie")).toEqual(expect.stringContaining("Path=/"));
    expect(state).toMatch(/^[a-f0-9-]{36}$/);
    expect((await start()).state).not.toBe(state);
  });

  it("redirects unconfigured login to a fixed error destination", async () => {
    const response = await createApp({
      db: deps.db,
      encryptionKey: deps.encryptionKey,
      sessionSecret: deps.sessionSecret,
      secureCookies: deps.secureCookies,
      publicAppUrl: deps.publicAppUrl,
    }).request("/auth/paypal/start?next=https://evil.example");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://niryat.example/login?error=paypal_unavailable",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    "missing_cookie",
    "tampered_cookie",
    "missing_state",
    "wrong_state",
    "missing_code",
    "refused_consent",
    "expired",
  ])("rejects %s before identifying the user", async (failure) => {
    const { cookie, state } = await start();
    const query = new URLSearchParams({ code: "secret-code", state });
    let sentCookie = cookie;
    if (failure === "missing_cookie") sentCookie = "";
    if (failure === "tampered_cookie") sentCookie = `${cookie}tampered`;
    if (failure === "missing_state") query.delete("state");
    if (failure === "wrong_state") query.set("state", randomUUID());
    if (failure === "missing_code") query.delete("code");
    if (failure === "refused_consent") query.set("error", "access_denied");
    const time = vi.spyOn(Date, "now");
    try {
      if (failure === "expired") time.mockReturnValue(Date.now() + 601_000);
      const response = await app.request(`/auth/paypal/callback?${query}`, {
        headers: { Cookie: sentCookie },
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://niryat.example/login?error=paypal_cancelled",
      );
      expect(response.headers.get("set-cookie")).toContain("niryat_paypal_state=;");
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
      expect(identify).not.toHaveBeenCalled();
    } finally {
      time.mockRestore();
    }
  });

  it.each(["exchange_failed", "userinfo_failed"] as const)(
    "handles %s without starting a session",
    async (reason) => {
      identify.mockResolvedValue({ ok: false, reason });
      const { cookie, state } = await start();
      const response = await app.request(`/auth/paypal/callback?state=${state}&code=secret-code`, {
        headers: { Cookie: cookie },
      });
      expect(response.headers.get("location")).toBe(
        "https://niryat.example/login?error=paypal_failed",
      );
      expect(response.headers.get("set-cookie")).not.toContain("niryat_session=");
      expect(identify).toHaveBeenCalledExactlyOnceWith("secret-code");
    },
  );

  it("logs only a fixed message for thrown identity errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      identify.mockRejectedValue(new Error("secret-token and email"));
      const { cookie, state } = await start();
      const response = await app.request(`/auth/paypal/callback?state=${state}&code=secret-code`, {
        headers: { Cookie: cookie },
      });
      expect(response.headers.get("location")).toBe(
        "https://niryat.example/login?error=paypal_unavailable",
      );
      expect(log).toHaveBeenCalledExactlyOnceWith("PayPal sign-in unavailable");
    } finally {
      log.mockRestore();
    }
  });
});

describe.skipIf(!testDatabaseUrl)("auth routes", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let app: ReturnType<typeof createApp>;
  const credentials = { email: "auth@example.com", password: "correct-horse-battery" };
  const identify = vi.fn<PayPalLogin["identify"]>();

  beforeAll(async () => {
    t = await openTestDb();
    app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
      publicAppUrl: "http://localhost:3000",
      paypalLogin: {
        authorizeUrl: (state) => `https://www.sandbox.paypal.com/connect?state=${state}`,
        identify,
      },
    });
  });
  beforeEach(async () => {
    await t.reset();
    identify
      .mockReset()
      .mockResolvedValue({ ok: true, paypalId: "PAYER-1", email: credentials.email });
  });
  afterAll(async () => {
    await t?.close();
  });

  function post(path: string, body: unknown = credentials) {
    return app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function paypalCallback() {
    const start = await app.request("/auth/paypal/start");
    const cookie = start.headers.get("set-cookie")?.split(";")[0];
    const state = new URL(start.headers.get("location") ?? "").searchParams.get("state");
    if (!cookie || !state) throw new Error("Expected OAuth state");
    return app.request(`/auth/paypal/callback?state=${state}&code=test-code`, {
      headers: { Cookie: cookie },
    });
  }

  it("creates a PayPal user and starts a session, then reuses the linked account", async () => {
    const response = await paypalCallback();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/overview");
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith("niryat_session="))?.split(";")[0];
    if (!session) throw new Error("Expected session");
    expect(cookies).toContainEqual(expect.stringContaining("niryat_paypal_state=;"));
    const me = await app.request("/auth/me", { headers: { Cookie: session } });
    expect(await me.json()).toEqual({
      id: expect.any(String),
      email: credentials.email,
      role: "freelancer",
    });
    const first = await findUserByEmail(t.db, credentials.email);
    identify.mockResolvedValue({ ok: true, paypalId: "PAYER-1", email: undefined });
    expect((await paypalCallback()).headers.get("location")).toBe("http://localhost:3000/overview");
    expect(await findUserByEmail(t.db, credentials.email)).toEqual(first);
  });

  it("rejects password sign-in for a PayPal-only account", async () => {
    await paypalCallback();
    const response = await post("/auth/login");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_credentials" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not take over an email account with PayPal", async () => {
    await createUser(t.db, { email: credentials.email, passwordHash: "existing-hash" });
    const response = await paypalCallback();
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=email_taken");
    expect(response.headers.get("set-cookie")).not.toContain("niryat_session=");
  });

  it("does not sign a CA in through PayPal", async () => {
    await post("/auth/ca/signup");
    const response = await paypalCallback();
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=email_taken");
    expect(response.headers.get("set-cookie")).not.toContain("niryat_session=");
    expect((await findUserByEmail(t.db, credentials.email))?.role).toBe("ca");
  });

  it.each(userRoles)("signup fixes the role to the %s portal", async (role) => {
    const prefix = role === "ca" ? "/auth/ca" : "/auth";
    const response = await post(`${prefix}/signup`, {
      ...credentials,
      role: role === "ca" ? "freelancer" : "ca",
    });
    expect(response.status).toBe(201);
    const user = sessionUserSchema.omit({ role: true }).parse(await response.json());
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    const me = await app.request("/auth/me", { headers: { Cookie: cookie } });
    expect(await me.json()).toEqual({ ...user, role });
    expect((await findUserByEmail(t.db, credentials.email))?.role).toBe(role);
    const health = await app.request("/health-check", { headers: { Cookie: cookie } });
    expect(health.status).toBe(role === "ca" ? 401 : 404);
    expect(await health.json()).toEqual({
      error: role === "ca" ? "unauthenticated" : "not_found",
    });
  });

  it.each(userRoles)(
    "rejects %s signup when the other portal already owns the email",
    async (role) => {
      const prefix = role === "ca" ? "/auth/ca" : "/auth";
      await post(`${role === "ca" ? "/auth" : "/auth/ca"}/signup`);
      const response = await post(`${prefix}/signup`);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "email_taken" });
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  for (const role of userRoles) {
    for (const portal of userRoles) {
      it.each([true, false])(
        `${role} account at ${portal} login with valid password=%s`,
        async (validPassword) => {
          const user = await createUser(t.db, {
            email: credentials.email,
            role,
            passwordHash: await passwords.hashPassword(credentials.password),
          });
          const response = await post(`${portal === "ca" ? "/auth/ca" : "/auth"}/login`, {
            ...credentials,
            password: validPassword ? credentials.password : "wrong-horse-battery",
          });
          if (!validPassword) {
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ error: "invalid_credentials" });
            expect(response.headers.get("set-cookie")).toBeNull();
          } else if (role !== portal) {
            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({ error: "wrong_portal", portal: role });
            expect(response.headers.get("set-cookie")).toBeNull();
          } else {
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(user);
            const cookie = response.headers.get("set-cookie")?.split(";")[0];
            if (!cookie) throw new Error("Expected a session cookie");
            const headers = { Cookie: cookie };
            expect(await (await app.request("/auth/me", { headers })).json()).toEqual({
              ...user,
              role,
            });
            const health = await app.request("/health-check", { headers });
            expect(health.status).toBe(role === "ca" ? 401 : 404);
            expect(await health.json()).toEqual({
              error: role === "ca" ? "unauthenticated" : "not_found",
            });
          }
        },
      );
    }
  }

  it("reports a missing PayPal email without creating a session", async () => {
    identify.mockResolvedValue({ ok: true, paypalId: "PAYER-1", email: undefined });
    const response = await paypalCallback();
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=no_email");
    expect(response.headers.get("set-cookie")).not.toContain("niryat_session=");
  });

  it("signs up, normalizes email, and starts a session without exposing the password hash", async () => {
    const response = await post("/auth/signup", { ...credentials, email: " AUTH@EXAMPLE.COM " });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: expect.any(String), email: credentials.email });
    expect(response.headers.get("set-cookie")).toMatch(/^niryat_session=/);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("rejects duplicate email", async () => {
    await post("/auth/signup");
    const response = await post("/auth/signup");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "email_taken" });
  });

  it("logs in with the right password and starts a session", async () => {
    const signup = await post("/auth/signup");
    const user: unknown = await signup.json();
    const response = await post("/auth/login");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    expect(response.headers.get("set-cookie")).toMatch(/^niryat_session=/);
  });

  it("rejects a wrong password", async () => {
    await post("/auth/signup");
    const response = await post("/auth/login", { ...credentials, password: "wrong-horse-battery" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_credentials" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["/auth/login", "/auth/ca/login"])(
    "checks the dummy hash for unknown email at %s",
    async (path) => {
      const verify = vi.spyOn(passwords, "verifyPassword");
      try {
        const response = await post(path);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid_credentials" });
        expect(verify).toHaveBeenCalledExactlyOnceWith(
          credentials.password,
          expect.stringMatching(/^scrypt\$16384\$8\$1\$/),
        );
        expect(response.headers.get("set-cookie")).toBeNull();
      } finally {
        verify.mockRestore();
      }
    },
  );

  it("returns the signed-in user and rejects a missing session", async () => {
    const signup = await post("/auth/signup");
    const user = sessionUserSchema.omit({ role: true }).parse(await signup.json());
    const cookie = signup.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    const response = await app.request("/auth/me", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...user, role: "freelancer" });
    const anonymous = await app.request("/auth/me");
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "unauthenticated" });
  });

  it("logs in a CA with its stored role while denying freelancer routes", async () => {
    const user = await createUser(t.db, {
      email: "ca@example.com",
      role: "ca",
      passwordHash: await passwords.hashPassword(credentials.password),
    });
    if (!user) throw new Error("Expected CA user");
    const login = await post("/auth/ca/login", {
      email: user.email,
      password: credentials.password,
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual(user);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    const headers = { Cookie: cookie };
    const response = await app.request("/auth/me", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...user, role: "ca" });
    const health = await app.request("/health-check", { headers });
    expect(health.status).toBe(401);
    expect(await health.json()).toEqual({ error: "unauthenticated" });
    const logout = await app.request("/auth/logout", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("niryat_session=;");
  });

  it("logs out and clears the cookie", async () => {
    const response = await post("/auth/logout", {});
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toContain("niryat_session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it.each(["signup", "login", "ca/signup", "ca/login", "logout"])(
    "rejects non-JSON POST /auth/%s",
    async (action) => {
      const response = await app.request(`/auth/${action}`, { method: "POST", body: "payload" });
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    },
  );

  it.each(["/auth/signup", "/auth/ca/signup"])(
    "rejects a short password at %s with field names only",
    async (path) => {
      const response = await post(path, { ...credentials, password: "short" });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request", fields: ["password"] });
    },
  );

  it.each(["/auth/login", "/auth/ca/login"])("rejects malformed JSON at %s", async (path) => {
    const response = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request", fields: [""] });
  });
});
