import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { dashboardSchema, profileInputSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";
import * as clock from "../rules";

const profile = profileInputSchema.parse({
  legalName: "Synthetic seller",
  address: "Synthetic address",
  gstRegistered: true,
  gstin: null,
  lutNumber: "LUT",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
});

describe("dashboard route with fake reads", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = createApp(deps);
  const userId = randomUUID();
  let cookie: string;
  beforeAll(async () => {
    cookie = await cookieFor(userId, deps.sessionSecret);
  });
  beforeEach(() => {
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-10-31");
    vi.spyOn(db, "getProfile").mockResolvedValue(undefined);
    vi.spyOn(db, "listInvoices").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  it("requires a session before reading any records", async () => {
    const response = await app.request("/dashboard");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(db.getProfile).not.toHaveBeenCalled();
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it("returns empty sources and no health without a profile or invoices", async () => {
    const response = await app.request("/dashboard", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(dashboardSchema.parse(await response.json())).toEqual({
      asOf: "2026-10-31",
      health: null,
      payments: [],
      invoices: [],
      disputes: [],
    });
    expect(db.getProfile).toHaveBeenCalledWith(deps.db, userId, deps.encryptionKey);
    expect(db.listInvoices).toHaveBeenCalledWith(deps.db, userId);
  });
});

describe.skipIf(!testDatabaseUrl)("dashboard route with a stored ledger", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const key = randomBytes(32);
  const secret = "x".repeat(32);
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-10-31");
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await t?.close();
  });

  it("returns only each signed-in user's ledger, without emails or addresses", async () => {
    const app = createApp({
      db: t.db,
      encryptionKey: key,
      sessionSecret: secret,
      secureCookies: false,
    });
    const users = [
      await db.createUser(t.db, { email: "dashboard-a@example.test", passwordHash: "unused" }),
      await db.createUser(t.db, { email: "dashboard-b@example.test", passwordHash: "unused" }),
    ];
    const [a, b] = users;
    if (!a || !b) throw new Error("Expected users");
    await db.upsertProfile(t.db, a.id, profile, key);
    const invoiceIds = [randomUUID(), randomUUID()];
    for (const [index, user] of [a, b].entries()) {
      const clientId = randomUUID();
      await t.db.insert(db.clients).values({
        id: clientId,
        userId: user.id,
        name: `Client ${index}`,
        country: "US",
        email: `buyer-${index}@example.test`,
        address: "Synthetic buyer address",
      });
      const invoiceId = invoiceIds[index];
      if (!invoiceId) throw new Error("Expected invoice ID");
      await t.db.insert(db.invoices).values({
        id: invoiceId,
        userId: user.id,
        clientId,
        type: "one_time",
        number: `2026-27/000${index + 1}`,
        fy: "2026-27",
        seq: index + 1,
        date: "2026-09-30",
        currency: "USD",
        amount: "100.00",
        description: "Software",
        sac: "998314",
        status: "partially_refunded",
      });
      await t.db.insert(db.payments).values([
        {
          invoiceId,
          paypalTxnId: `CAPTURE-${index}`,
          kind: "payment",
          gross: "100.00",
          fee: "4.40",
          net: "95.60",
          currency: "USD",
          fxRate: "84.10",
          receivedAt: new Date("2026-09-30T20:00:00Z"),
        },
        {
          invoiceId,
          paypalTxnId: `REFUND-${index}`,
          kind: "refund",
          gross: "10.00",
          currency: "USD",
          receivedAt: new Date("2026-10-02T00:00:00Z"),
        },
      ]);
      await t.db.insert(db.disputes).values({
        invoiceId,
        paypalDisputeId: `DISPUTE-${index}`,
        amount: "10.00",
        currency: "USD",
        reason: "OTHER",
        status: "OPEN",
        responseDueDate: "2026-11-05",
        paypalUpdatedAt: new Date("2026-10-30T00:00:00Z"),
      });
    }
    for (const [index, user] of [a, b].entries()) {
      const response = await app.request("/dashboard", {
        headers: { Cookie: await cookieFor(user.id, secret) },
      });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(JSON.stringify(body)).not.toMatch(/email|address|example\.test/i);
      const dashboard = dashboardSchema.parse(body);
      expect(dashboard.health === null).toBe(index === 1);
      expect(dashboard.invoices.map((row) => row.invoiceId)).toEqual([invoiceIds[index]]);
      expect(dashboard.invoices[0]?.clientName).toBe(`Client ${index}`);
      expect(
        dashboard.payments
          .map(({ kind, month, financialYear, signedGross }) => ({
            kind,
            month,
            financialYear,
            signedGross,
          }))
          .sort((x, y) => x.kind.localeCompare(y.kind)),
      ).toEqual([
        { kind: "payment", month: "2026-10", financialYear: "2026-27", signedGross: "100.00" },
        { kind: "refund", month: "2026-10", financialYear: "2026-27", signedGross: "-10.00" },
      ]);
      expect(dashboard.disputes.map((row) => row.paypalDisputeId)).toEqual([`DISPUTE-${index}`]);
    }
  });
});
