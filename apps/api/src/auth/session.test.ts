import { randomBytes, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import { describe, expect, it } from "vitest";
import {
  endSession,
  readSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  startSession,
} from "./session";

const secret = randomBytes(32).toString("base64");
const userId = randomUUID();
const now = Math.floor(Date.now() / 1000);

function sessionApp(nowSeconds = now) {
  const app = new Hono();
  app.get("/start", async (c) => {
    await startSession(c, userId, secret, true);
    return c.body(null, 204);
  });
  app.get("/read", async (c) =>
    c.json({ userId: (await readSession(c, secret, nowSeconds)) ?? null }),
  );
  app.post("/end", (c) => {
    endSession(c);
    return c.body(null, 204);
  });
  return app;
}

async function signedCookie(value: string) {
  const app = new Hono();
  app.get("/", async (c) => {
    await setSignedCookie(c, SESSION_COOKIE, value, secret);
    return c.body(null, 204);
  });
  const header = (await app.request("/")).headers.get("set-cookie");
  if (!header) throw new Error("Expected a session cookie");
  return header.split(";")[0] ?? "";
}

describe("signed sessions", () => {
  it("starts a session with cookie protections and reads the user ID", async () => {
    const app = sessionApp(Math.floor(Date.now() / 1000) + 1);
    const response = await app.request("/start");
    const header = response.headers.get("set-cookie");
    expect(header).toContain(`${SESSION_COOKIE}=`);
    for (const attribute of [
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
      "Path=/",
      `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ]) {
      expect(header).toContain(attribute);
    }
    const cookie = header?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    const read = await app.request("/read", { headers: { Cookie: cookie } });
    expect(await read.json()).toEqual({ userId });
  });

  it("rejects a tampered cookie", async () => {
    const cookie = await signedCookie(`${userId}.${now}`);
    const response = await sessionApp().request("/read", {
      headers: { Cookie: cookie.replace(userId, randomUUID()) },
    });
    expect(await response.json()).toEqual({ userId: null });
  });

  it("accepts the lifetime boundary and rejects expired sessions", async () => {
    const cookie = await signedCookie(`${userId}.${now}`);
    const headers = { Cookie: cookie };
    const boundary = await sessionApp(now + SESSION_MAX_AGE_SECONDS).request("/read", { headers });
    expect(await boundary.json()).toEqual({ userId });
    const expired = await sessionApp(now + 8 * 24 * 60 * 60).request("/read", { headers });
    expect(await expired.json()).toEqual({ userId: null });
  });

  it("rejects a missing cookie", async () => {
    const response = await sessionApp().request("/read");
    expect(await response.json()).toEqual({ userId: null });
  });

  it.each([
    `not-a-uuid.${now}`,
    `${userId}.invalid`,
    `${userId}.${now + 60}`,
    `${userId}.${now}.extra`,
  ])("rejects invalid signed session data %s", async (value) => {
    const response = await sessionApp().request("/read", {
      headers: { Cookie: await signedCookie(value) },
    });
    expect(await response.json()).toEqual({ userId: null });
  });

  it("clears the cookie on logout", async () => {
    const response = await sessionApp().request("/end", { method: "POST" });
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
  });
});
