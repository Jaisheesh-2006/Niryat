import { randomBytes } from "node:crypto";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { healthReportSchema, type ProfileInput } from "@niryat/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../index";

describe.skipIf(!testDatabaseUrl)("health-check route", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let app: ReturnType<typeof createApp>;
  const profile: ProfileInput = {
    legalName: "Ananya Rao",
    address: "12 MG Road, Pune 411001",
    gstRegistered: true,
    gstin: "27ABCDE1234F1Z5",
    lutNumber: "AD271026000001",
    lutValidFrom: "2025-04-01",
    lutValidTo: "2026-03-31",
    workType: "Software development",
    purposeCode: "P1006",
    panLast4: "234F",
    expectedTurnoverInr: 1_800_000,
    gstr1Frequency: null,
    specifiedProfession: null,
  };

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

  async function signup(email = "health-a@example.com") {
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

  async function saveProfile(cookie: string) {
    const response = await app.request("/profile", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    expect(response.status).toBe(200);
  }

  it("requires a session", async () => {
    const response = await app.request("/health-check");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns not found for a signed-in user without a profile", async () => {
    const { cookie } = await signup();
    const response = await app.request("/health-check", { headers: { Cookie: cookie } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("evaluates the demo profile with the expected flags, score and suggestion", async () => {
    const { cookie } = await signup();
    await saveProfile(cookie);
    const response = await app.request("/health-check", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const report = healthReportSchema.parse(await response.json());
    expect(report.flags.map((flag) => flag.code)).toEqual(["lut_expired", "purpose_code_mismatch"]);
    expect(report.score).toBe(55);
    expect(report.suggestion?.code).toBe("P0802");
  });

  it("never returns another user's report", async () => {
    const a = await signup();
    const b = await signup("health-b@example.com");
    await saveProfile(a.cookie);
    const response = await app.request("/health-check", { headers: { Cookie: b.cookie } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
