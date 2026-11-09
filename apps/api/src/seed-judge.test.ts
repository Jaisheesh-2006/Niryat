import { randomBytes } from "node:crypto";
import {
  agentActions,
  caLinks,
  clients,
  createDb,
  createUser,
  disputes,
  firaDocuments,
  firaLines,
  getProfile,
  invoices,
  listCaClients,
  listClients,
  listInvoices,
  matches,
  payments,
  profiles,
  proposeRefund,
  users,
} from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { evaluateHealth, prepareExportInvoice } from "@niryat/rules";
import { JUDGE_EMAILS, sessionUserSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startAndExecute } from "./close";
import { loadEnv } from "./env";
import { createApp } from "./index";
import { createRateLimiter, RATE_LIMITS } from "./rate-limit";
import { rules } from "./rules";
import { main, seedJudge } from "./seed-judge";

const now = new Date("2026-11-05T12:00:00+05:30");
const key = randomBytes(32);
const buyer = "sandbox-buyer@example.com";
const request = (as: string) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ as }),
});

describe("judge mode off and configuration", () => {
  const database = createDb("postgresql://unused:unused@localhost:1/unused");
  afterAll(() => database.close());
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("defaults off, accepts only explicit true and reports invalid key names", () => {
    expect(loadEnv({}).JUDGE_MODE).toBe(false);
    expect(loadEnv({ JUDGE_MODE: "" }).JUDGE_MODE).toBe(false);
    expect(loadEnv({ JUDGE_MODE: "false" }).JUDGE_MODE).toBe(false);
    expect(loadEnv({ JUDGE_MODE: "true" }).JUDGE_MODE).toBe(true);
    expect(() => loadEnv({ JUDGE_MODE: "private-invalid" })).toThrow(
      "Invalid environment: JUDGE_MODE.",
    );
  });
  it("returns a public false flag without credentials and 404 without database access when off", async () => {
    expect(await (await createApp().request("/judge-mode")).json()).toEqual({ enabled: false });
    const app = createApp({
      db: database.db,
      encryptionKey: key,
      sessionSecret: "s".repeat(32),
      secureCookies: false,
    });
    const lookup = vi.spyOn(database.db, "select");
    for (const init of [request("ca"), { method: "POST" }]) {
      const response = await app.request("/auth/judge", init);
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(lookup).not.toHaveBeenCalled();
  });
  it("rejects a disabled seed before connecting or loading environment files", async () => {
    vi.stubEnv("JUDGE_MODE", "false");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const load = vi.spyOn(process, "loadEnvFile");
    await main();
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("Judge seed failed; check JUDGE_MODE"),
    );
    expect(load).not.toHaveBeenCalled();
  });
});

describe.skipIf(!testDatabaseUrl)("judge seed and sessions", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const deps = () => ({
    db: t.db,
    encryptionKey: key,
    sessionSecret: "s".repeat(32),
    secureCookies: true,
    judgeMode: true,
  });
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });
  async function counts() {
    return Promise.all(
      [
        users,
        profiles,
        clients,
        invoices,
        payments,
        disputes,
        caLinks,
        firaDocuments,
        firaLines,
        matches,
        agentActions,
      ].map(async (table) => (await t.db.select().from(table)).length),
    );
  }

  it("seeds once under concurrent/repeated runs, with encrypted profiles, proven links and safe synthetic history", async () => {
    await Promise.all([seedJudge(t.db, key, buyer, now), seedJudge(t.db, key, buyer, now)]);
    expect(await counts()).toEqual([4, 3, 3, 7, 6, 1, 3, 1, 3, 3, 0]);
    const saved = await t.db.select().from(users);
    expect(saved.every((user) => user.passwordHash === null && user.paypalPayerId === null)).toBe(
      true,
    );
    const ca = saved.find((user) => user.role === "ca");
    const owner = saved.find((user) => user.email === JUDGE_EMAILS.freelancer);
    const healthy = saved.find((user) => user.email === "judge-freelancer-2@niryat.test");
    if (!ca || !owner || !healthy) throw new Error("Missing accounts");
    expect(await listCaClients(t.db, ca.id)).toHaveLength(3);
    expect(
      (await t.db.select().from(caLinks)).every(
        (link) => link.status === "accepted" && link.invitationCodeHash && link.caUserId === ca.id,
      ),
    ).toBe(true);
    expect(await getProfile(t.db, ca.id, key)).toBeUndefined();
    const profile = await getProfile(t.db, owner.id, key);
    expect(profile).toMatchObject({
      legalName: "Ananya Rao",
      lutValidFrom: "2026-04-01",
      lutValidTo: "2026-11-20",
      purposeCode: "P1006",
      gstr1Frequency: "monthly",
    });
    if (!profile) throw new Error("Missing profile");
    expect(
      evaluateHealth(profile, { today: "2026-11-05", rules }).flags.map((flag) => flag.code),
    ).toEqual(expect.arrayContaining(["lut_expiring", "purpose_code_mismatch"]));
    const healthyProfile = await getProfile(t.db, healthy.id, key);
    if (!healthyProfile) throw new Error("Missing healthy profile");
    expect(evaluateHealth(healthyProfile, { today: "2026-11-05", rules }).flags).toEqual([]);
    expect((await t.db.select().from(profiles))[0]?.gstin).not.toBe("27ABCDE1234F1Z5");
    const ledger = await listInvoices(t.db, owner.id);
    expect(
      ledger.some(
        (invoice) => invoice.status === "partially_refunded" && invoice.refunds.length === 1,
      ),
    ).toBe(true);
    expect(
      ledger
        .flatMap((invoice) => invoice.payments)
        .every((payment) => payment.fee === "30.00" && payment.net === "970.00"),
    ).toBe(true);
    expect(
      ledger
        .filter((invoice) => invoice.status === "sent")
        .every((invoice) => invoice.paypalInvoiceId === null),
    ).toBe(true);
    expect((await t.db.select().from(clients)).every((client) => client.email === buyer)).toBe(
      true,
    );
    const [liveClient] = await listClients(t.db, owner.id, key);
    if (!liveClient?.exportCheck) throw new Error("Missing export client");
    expect(
      prepareExportInvoice(
        {
          profile,
          client: { ...liveClient, answers: liveClient.exportCheck.answers },
          invoice: {
            number: "2026-27/0005",
            date: "2026-11-05",
            description: "Demo software",
            sac: "998314",
            currency: "USD",
            amount: "10.00",
          },
        },
        { rules },
      ).ok,
    ).toBe(true);
    const before = await counts();
    await seedJudge(t.db, key, "changed-buyer@example.com", new Date("2026-12-05T00:00:00Z"));
    expect(await counts()).toEqual(before);
    expect((await t.db.select().from(clients)).every((client) => client.email === buyer)).toBe(
      true,
    );
    expect((await getProfile(t.db, owner.id, key))?.lutValidTo).toBe("2026-11-20");
  });

  it.each([
    { passwordHash: "existing-private-hash" },
    { paypalId: "existing-private-payer" },
    { role: "ca" as const },
  ])("refuses reserved account collisions and rolls the whole seed back: %j", async (collision) => {
    await createUser(t.db, { email: JUDGE_EMAILS.freelancer, ...collision });
    await expect(seedJudge(t.db, key, buyer, now)).rejects.toThrow("Judge account collision");
    expect(await counts()).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect((await createApp(deps()).request("/auth/judge", request("freelancer"))).status).toBe(
      503,
    );
  });

  it("rejects manual refunds for synthetic judge payments without creating approvals", async () => {
    await seedJudge(t.db, key, buyer, now);
    const payloadFor = vi.fn(() => ({}));
    for (const user of (await t.db.select().from(users)).filter(
      (user) => user.role === "freelancer",
    )) {
      for (const payment of (await listInvoices(t.db, user.id)).flatMap(
        (invoice) => invoice.payments,
      )) {
        expect(await proposeRefund(t.db, user.id, payment.id, "1.00", payloadFor)).toEqual({
          ok: false,
          reason: "synthetic_payment",
        });
      }
    }
    const app = createApp(deps());
    const login = await app.request("/auth/judge", request("freelancer"));
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const owner = sessionUserSchema.parse(await login.json());
    for (const payment of (await listInvoices(t.db, owner.id)).flatMap(
      (invoice) => invoice.payments,
    )) {
      const response = await app.request(`/payments/${payment.id}/refunds`, {
        ...request("freelancer"),
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ amount: "1.00" }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "synthetic_payment" });
    }
    expect(payloadFor).not.toHaveBeenCalled();
    expect(await t.db.select().from(agentActions)).toEqual([]);
  });

  it("closes all seeded freelancers with zero reminder proposals and shows an overdue RBI record", async () => {
    await seedJudge(t.db, key, buyer, now);
    const app = createApp(deps());
    for (const user of (await t.db.select().from(users)).filter(
      (user) => user.role === "freelancer",
    )) {
      expect(
        await startAndExecute(
          { db: t.db, encryptionKey: key },
          {
            userId: user.id,
            kind: "monthly_close",
            trigger: "manual",
            month: "2026-11",
            asOf: "2026-11-05",
          },
          now,
        ),
      ).toBe("completed");
    }
    expect(await t.db.select().from(agentActions)).toEqual([]);
    const login = await app.request("/auth/judge", request("ca"));
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await app.request("/ca/dashboard", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"overdue":true');
  });

  it("gates missing/malformed accounts, signs both roles and keeps CA access read-only", async () => {
    const app = createApp(deps());
    expect((await app.request("/auth/judge", request("freelancer"))).status).toBe(503);
    expect((await app.request("/auth/judge", request("admin"))).status).toBe(400);
    expect((await app.request("/auth/judge", { method: "POST" })).status).toBe(415);
    expect(
      (
        await app.request("/auth/judge", {
          ...request("ca"),
          body: '{"as":"ca","userId":"injected"}',
        })
      ).status,
    ).toBe(400);
    await seedJudge(t.db, key, buyer, now);
    const flag = await app.request("/judge-mode");
    expect(await flag.json()).toEqual({ enabled: true });
    expect(flag.headers.get("cache-control")).toBe("no-store");
    for (const as of ["freelancer", "ca"] as const) {
      const login = await app.request("/auth/judge", request(as));
      expect(login.status).toBe(200);
      const header = login.headers.get("set-cookie") ?? "";
      expect(header).toContain("HttpOnly");
      expect(header).toContain("Secure");
      expect(header).toContain("SameSite=Lax");
      const headers = { Cookie: header.split(";")[0] ?? "" };
      const user = sessionUserSchema.parse(
        await (await app.request("/auth/me", { headers })).json(),
      );
      expect(user).toMatchObject({ role: as, email: JUDGE_EMAILS[as] });
      expect((await app.request("/invoices", { headers })).status).toBe(as === "ca" ? 404 : 200);
      expect((await app.request("/ca/portfolio", { headers })).status).toBe(
        as === "ca" ? 200 : 401,
      );
    }
  });

  it("applies the existing auth bucket to judge login", async () => {
    const app = createApp({
      ...deps(),
      rateLimits: {
        auth: createRateLimiter(RATE_LIMITS.auth),
        ai: createRateLimiter(RATE_LIMITS.ai),
        dashboard: createRateLimiter(RATE_LIMITS.dashboard),
        share: createRateLimiter(RATE_LIMITS.share),
      },
    });
    for (let i = 0; i < 10; i++)
      expect((await app.request("/auth/judge", request("admin"))).status).toBe(400);
    const response = await app.request("/auth/judge", request("admin"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});
