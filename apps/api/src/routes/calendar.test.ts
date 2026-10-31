import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { calendarEventSchema, profileInputSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";
import * as clock from "../rules";

const profile = profileInputSchema.parse({
  legalName: null,
  address: null,
  gstRegistered: true,
  gstin: null,
  lutNumber: "LUT",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
  gstr1Frequency: "quarterly",
});

describe("calendar route with fake reads", () => {
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
    const response = await app.request("/calendar");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(db.getProfile).not.toHaveBeenCalled();
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it("returns the always-present tax dates without a profile or invoices", async () => {
    const response = await app.request("/calendar", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const events = calendarEventSchema.array().parse(await response.json());
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.kind === "advance_tax")).toBe(true);
    expect(db.getProfile).toHaveBeenCalledWith(deps.db, userId, deps.encryptionKey);
    expect(db.listInvoices).toHaveBeenCalledWith(deps.db, userId);
  });
});

describe.skipIf(!testDatabaseUrl)("calendar route with a stored ledger", () => {
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

  it("isolates profile, invoice, credit-note and dispute events for two signed-in users", async () => {
    const app = createApp({
      db: t.db,
      encryptionKey: key,
      sessionSecret: secret,
      secureCookies: false,
    });
    const a = await db.createUser(t.db, {
      email: "calendar-a@example.test",
      passwordHash: "unused",
    });
    const b = await db.createUser(t.db, {
      email: "calendar-b@example.test",
      passwordHash: "unused",
    });
    if (!a || !b) throw new Error("Expected users");
    await db.upsertProfile(t.db, a.id, profile, key);
    const invoiceIds = [randomUUID(), randomUUID()];
    for (const [index, user] of [a, b].entries()) {
      const clientId = randomUUID();
      await t.db
        .insert(db.clients)
        .values({ id: clientId, userId: user.id, name: "Synthetic client", country: "US" });
      const invoiceId = invoiceIds[index];
      if (!invoiceId) throw new Error("Expected invoice ID");
      await t.db.insert(db.invoices).values({
        id: invoiceId,
        userId: user.id,
        clientId,
        type: "one_time",
        number: `2025-26/000${index + 1}`,
        fy: "2025-26",
        seq: index + 1,
        date: "2026-01-31",
        currency: "USD",
        amount: "100.00",
        description: "Software",
        sac: "998314",
        status: "sent",
      });
      await t.db.insert(db.disputes).values({
        invoiceId,
        paypalDisputeId: `DISPUTE-${index}`,
        amount: "10.00",
        currency: "USD",
        reason: "OTHER",
        status: "OPEN",
        responseDueDate: "2026-10-30",
        paypalUpdatedAt: new Date("2026-10-30T00:00:00Z"),
      });
      await t.db.insert(db.payments).values({
        invoiceId,
        paypalTxnId: `REFUND-${index}`,
        kind: "refund",
        gross: "10.00",
        currency: "USD",
        receivedAt: new Date("2026-02-01T00:00:00Z"),
      });
    }
    for (const [index, user] of [a, b].entries()) {
      const response = await app.request("/calendar", {
        headers: { Cookie: await cookieFor(user.id, secret) },
      });
      expect(response.status).toBe(200);
      const events = calendarEventSchema.array().parse(await response.json());
      const invoiceEvents = events.filter((event) => event.href.startsWith("/invoices"));
      expect(invoiceEvents.map((event) => event.id).sort()).toEqual(
        (index === 0
          ? [`rbi:${invoiceIds[index]}`, `dispute:DISPUTE-${index}`, `credit-note:REFUND-${index}`]
          : [`rbi:${invoiceIds[index]}`, `dispute:DISPUTE-${index}`]
        ).sort(),
      );
      expect(
        invoiceEvents.every((event) => event.href === `/invoices#invoice-${invoiceIds[index]}`),
      ).toBe(true);
      expect(events.some((event) => event.kind === "lut_renewal")).toBe(index === 0);
      expect(events.some((event) => event.kind === "gstr1_due")).toBe(index === 0);
      expect(events.some((event) => event.kind === "advance_tax")).toBe(true);
    }
  });
});
