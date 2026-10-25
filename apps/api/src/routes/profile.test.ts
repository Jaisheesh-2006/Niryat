import { randomBytes } from "node:crypto";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import type { ProfileInput } from "@niryat/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../index";

describe.skipIf(!testDatabaseUrl)("profile routes", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let app: ReturnType<typeof createApp>;
  const profile: ProfileInput = {
    gstRegistered: true,
    gstin: "27abcde1234f1z5",
    lutNumber: "LUT-1",
    lutValidFrom: "2026-04-01",
    lutValidTo: "2027-03-31",
    workType: "Software development",
    purposeCode: "P0802",
    panLast4: "234F",
    expectedTurnoverInr: 1_800_000,
  };
  const savedProfile = { ...profile, gstin: "27ABCDE1234F1Z5" };

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

  async function signup(email = "profile-a@example.com") {
    const response = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery" }),
    });
    expect(response.status).toBe(201);
    const user = z.object({ id: z.uuid(), email: z.email() }).parse(await response.json());
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    return { ...user, cookie };
  }

  function put(cookie: string, body: unknown = profile) {
    return app.request("/profile", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
  }

  function get(cookie: string) {
    return app.request("/profile", { headers: { Cookie: cookie } });
  }

  it.each(["GET", "PUT"])("requires a session for %s /profile", async (method) => {
    const response = await app.request("/profile", { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("saves and reads a normalized profile", async () => {
    const { cookie } = await signup();
    const saved = await put(cookie);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(savedProfile);
    const response = await get(cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(savedProfile);
  });

  it("keeps profiles isolated when another user reads and writes", async () => {
    const a = await signup();
    const b = await signup("profile-b@example.com");
    expect((await put(a.cookie)).status).toBe(200);
    const missing = await get(b.cookie);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
    const bProfile = { ...savedProfile, workType: "Design" };
    const saved = await put(b.cookie, bProfile);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(bProfile);
    expect(await (await get(b.cookie)).json()).toEqual(bProfile);
    expect(await (await get(a.cookie)).json()).toEqual(savedProfile);
  });

  it("rejects an invalid GSTIN with field names only", async () => {
    const { cookie } = await signup();
    const response = await put(cookie, { ...profile, gstin: "invalid" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request", fields: ["gstin"] });
    expect((await get(cookie)).status).toBe(404);
  });

  it("ignores a body userId and saves only under the session user", async () => {
    const a = await signup();
    const b = await signup("profile-b@example.com");
    expect((await put(a.cookie)).status).toBe(200);
    const bProfile = { ...savedProfile, workType: "Design" };
    const saved = await put(b.cookie, { ...bProfile, userId: a.id });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(bProfile);
    expect(await (await get(b.cookie)).json()).toEqual(bProfile);
    expect(await (await get(a.cookie)).json()).toEqual(savedProfile);
  });

  it("rejects a non-JSON PUT", async () => {
    const { cookie } = await signup();
    const response = await app.request("/profile", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "text/plain" },
      body: JSON.stringify(profile),
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
  });

  it("rejects malformed JSON", async () => {
    const { cookie } = await signup();
    const response = await app.request("/profile", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request", fields: [""] });
  });
});
