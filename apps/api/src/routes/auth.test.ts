import { randomBytes } from "node:crypto";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as passwords from "../auth/password";
import { createApp } from "../index";

describe.skipIf(!testDatabaseUrl)("auth routes", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let app: ReturnType<typeof createApp>;
  const credentials = { email: "auth@example.com", password: "correct-horse-battery" };

  beforeAll(async () => {
    t = await openTestDb();
    app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
    });
  });
  beforeEach(async () => {
    await t.reset();
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

  it("checks the dummy hash for an unknown email and returns the same error", async () => {
    const verify = vi.spyOn(passwords, "verifyPassword");
    try {
      const response = await post("/auth/login");
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
  });

  it("returns the signed-in user and rejects a missing session", async () => {
    const signup = await post("/auth/signup");
    const user: unknown = await signup.json();
    const cookie = signup.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    const response = await app.request("/auth/me", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    const anonymous = await app.request("/auth/me");
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "unauthenticated" });
  });

  it("logs out and clears the cookie", async () => {
    const response = await post("/auth/logout", {});
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toContain("niryat_session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it.each(["signup", "login", "logout"])("rejects non-JSON POST /auth/%s", async (action) => {
    const response = await app.request(`/auth/${action}`, { method: "POST", body: "payload" });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
  });

  it("rejects a short password with field names only", async () => {
    const response = await post("/auth/signup", { ...credentials, password: "short" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request", fields: ["password"] });
  });

  it("rejects malformed JSON", async () => {
    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request", fields: [""] });
  });
});
