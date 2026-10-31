import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import {
  gstr1FileSchema,
  gstr1PreviewSchema,
  type Invoice,
  profileInputSchema,
} from "@niryat/shared";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";
import * as clock from "../rules";
import { gstr1Routes } from "./gstr1";

const profile = profileInputSchema.parse({
  legalName: null,
  address: null,
  gstRegistered: true,
  gstin: null,
  lutNumber: "LUT",
  lutValidFrom: "2026-10-10",
  lutValidTo: "2027-03-31",
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
  gstr1Frequency: "monthly",
});
const userId = randomUUID();
const invoice: Invoice = {
  id: randomUUID(),
  clientId: randomUUID(),
  clientName: "Synthetic client",
  type: "one_time",
  number: "2026-27/0001",
  fy: "2026-27",
  date: "2026-10-15",
  currency: "USD",
  amount: "100.00",
  description: "Software",
  sac: "998314",
  recurrence: null,
  status: "issued",
  pdfUrl: null,
  paypalInvoiceId: null,
  paypalRecurringSeriesId: null,
  paidTotal: "0.00",
  payments: [],
  firaStatus: "pending",
  refundedTotal: "0.00",
  refunds: [],
  disputes: [],
  action: null,
  refundActions: [],
};
const rate = { inrRate: "84.1234", gstRate: "18" };

function post(app: Hono, cookie: string, body: unknown) {
  return app.request("/gstr1/file", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GSTR-1 routes with a fake ledger", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = new Hono().route("/", gstr1Routes(deps));
  let cookie: string;
  beforeAll(async () => {
    cookie = await cookieFor(userId, deps.sessionSecret);
  });
  beforeEach(() => {
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-11-01");
    vi.spyOn(db, "getProfile").mockResolvedValue(profile);
    vi.spyOn(db, "listInvoices").mockResolvedValue([invoice]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  it("requires authentication for both routes", async () => {
    expect((await app.request("/gstr1")).status).toBe(401);
    expect((await post(app, "", {})).status).toBe(401);
    expect(db.getProfile).not.toHaveBeenCalled();
  });

  it.each([
    { value: undefined, error: "not_found", status: 404 },
    { value: { ...profile, gstRegistered: false }, error: "not_gst_registered", status: 403 },
    { value: { ...profile, gstr1Frequency: null }, error: "gstr1_frequency_missing", status: 409 },
  ])("guards both routes with $error", async ({ value, error, status }) => {
    vi.mocked(db.getProfile).mockResolvedValue(value);
    for (const response of [
      await app.request("/gstr1", { headers: { Cookie: cookie } }),
      await post(app, cookie, { period: "2026-10", rates: {} }),
    ]) {
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
  });

  it.each(["2026-27-Q3", "2026-28-Q3", "2026-13", "2026-10&period=2026-09"])(
    "rejects invalid periods",
    async (period) => {
      const response = await app.request(`/gstr1?period=${period}`, {
        headers: { Cookie: cookie },
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_period" });
    },
  );

  it("returns a validated default preview with owner-scoped ledger reads", async () => {
    const response = await app.request("/gstr1", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(gstr1PreviewSchema.parse(await response.json())).toMatchObject({
      period: "2026-10",
      invoices: [{ invoiceId: invoice.id }],
    });
    expect(db.getProfile).toHaveBeenCalledWith(deps.db, userId, deps.encryptionKey);
    expect(db.listInvoices).toHaveBeenCalledWith(deps.db, userId);
  });

  it("reports omitted covered invoice numbers separately from invalid supplied rates", async () => {
    const response = await post(app, cookie, { period: "2026-10", rates: {} });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "rates_missing", invoices: [invoice.number] });
  });

  it.each([
    {},
    { inrRate: "84" },
    { gstRate: "18" },
    { ...rate, gstRate: null },
    { ...rate, gstRate: "-1" },
    { ...rate, gstRate: "100.01" },
    { ...rate, gstRate: "18.001" },
    { ...rate, gstRate: "1e1" },
    { ...rate, gstRate: "18\n" },
    { ...rate, inrRate: "0" },
    { ...rate, inrRate: "1e2" },
    { ...rate, inrRate: "84.12345" },
    { ...rate, inrRate: " 84" },
    { ...rate, inrRate: 84 },
    { ...rate, extra: "field" },
  ])("rejects malformed supplied rate entries without exposing values", async (entry) => {
    const response = await post(app, cookie, { period: "2026-10", rates: { [invoice.id]: entry } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_rates" });
  });

  it("rejects unknown or out-of-period invoice IDs and malformed bodies", async () => {
    for (const rates of [{ [randomUUID()]: rate }, { invalid: rate }]) {
      const response = await post(app, cookie, { period: "2026-10", rates });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_rates" });
    }
    const response = await app.request("/gstr1/file", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_rates" });
    expect(
      (
        await app.request("/gstr1/file", {
          method: "POST",
          headers: { Cookie: cookie },
          body: "text",
        })
      ).status,
    ).toBe(415);
  });

  it("returns the exact file with exclusions and preserves an explicit zero GST rate", async () => {
    const excluded = { ...invoice, id: randomUUID(), number: "2026-27/0002", date: "2026-10-01" };
    vi.mocked(db.listInvoices).mockResolvedValue([excluded, invoice]);
    for (const gstRate of ["18", "0"]) {
      const response = await post(app, cookie, {
        period: "2026-10",
        rates: { [invoice.id]: { ...rate, gstRate } },
      });
      expect(response.status).toBe(200);
      const file = gstr1FileSchema.parse(await response.json());
      expect(file).toMatchObject({
        fileName: "GSTR1-6A-2026-10.csv",
        rows: 1,
        totalInr: "8412.34",
        excluded: [{ invoiceId: excluded.id, reason: "lut_not_valid" }],
      });
      expect(file.csv).toContain(
        `WOPAY,${invoice.number},15-Oct-2026,8412.34,,,,${gstRate}.00,8412.34,\r\n`,
      );
      expect(file.csv).not.toContain(excluded.number);
    }
  });

  it("rejects a period with no covered invoices even when rates are omitted", async () => {
    for (const rows of [[], [{ ...invoice, date: "2026-10-01" }]]) {
      vi.mocked(db.listInvoices).mockResolvedValue(rows);
      const response = await post(app, cookie, { period: "2026-10", rates: {} });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "empty_period" });
    }
  });
});

describe.skipIf(!testDatabaseUrl)("GSTR-1 database isolation and reconciliation", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const key = randomBytes(32);
  const secret = "x".repeat(32);
  let app: Hono;
  beforeAll(async () => {
    t = await openTestDb();
    app = createApp({ db: t.db, encryptionKey: key, sessionSecret: secret, secureCookies: false });
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("reconciles seeded invoices/refunds and excludes another user's data and rates", async () => {
    const a = await db.createUser(t.db, { email: "gstr1-a@example.com" });
    const b = await db.createUser(t.db, { email: "gstr1-b@example.com" });
    if (!a || !b) throw new Error("Expected users");
    await db.upsertProfile(t.db, a.id, profile, key);
    await db.upsertProfile(t.db, b.id, profile, key);
    const clientId = randomUUID();
    await t.db
      .insert(db.clients)
      .values({ id: clientId, userId: a.id, name: "Synthetic client", country: "US" });
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await t.db.insert(db.invoices).values({
        id,
        userId: a.id,
        clientId,
        type: "one_time",
        number: `2026-27/000${index + 1}`,
        fy: "2026-27",
        seq: index + 1,
        date: "2026-10-15",
        currency: index === 2 ? "EUR" : "USD",
        amount: index === 0 ? "100.10" : index === 1 ? "50.20" : "12.30",
        description: "Software",
        sac: "998314",
        status: "issued",
      });
    }
    await t.db.insert(db.payments).values([
      {
        invoiceId: ids[0],
        paypalTxnId: "REFUND-OCT",
        kind: "refund",
        gross: "80.05",
        currency: "USD",
        receivedAt: new Date("2026-10-20T12:00:00Z"),
      },
      {
        invoiceId: ids[0],
        paypalTxnId: "REFUND-NOV",
        kind: "refund",
        gross: "20.05",
        currency: "USD",
        receivedAt: new Date("2026-10-31T20:00:00Z"),
      },
    ]);
    const cookieA = await cookieFor(a.id, secret);
    const cookieB = await cookieFor(b.id, secret);
    const october = await app.request("/gstr1?period=2026-10", { headers: { Cookie: cookieA } });
    expect(october.status).toBe(200);
    expect(gstr1PreviewSchema.parse(await october.json()).totals).toEqual([
      { currency: "EUR", invoices: "12.30", refunds: "0.00", net: "12.30" },
      { currency: "USD", invoices: "150.30", refunds: "80.05", net: "70.25" },
    ]);
    const november = await app.request("/gstr1?period=2026-11", { headers: { Cookie: cookieA } });
    const nov = gstr1PreviewSchema.parse(await november.json());
    expect(nov.invoices).toEqual([]);
    expect(nov.totals).toEqual([
      { currency: "USD", invoices: "0.00", refunds: "20.05", net: "-20.05" },
    ]);
    expect(nov.refunds).toMatchObject([
      { date: "2026-11-01", creditNote: { refundId: "REFUND-NOV" } },
    ]);
    const responseB = await app.request("/gstr1?period=2026-10", { headers: { Cookie: cookieB } });
    expect(gstr1PreviewSchema.parse(await responseB.json())).toMatchObject({
      invoices: [],
      refunds: [],
      totals: [],
    });
    const foreign = await post(app, cookieB, {
      period: "2026-10",
      rates: { [ids[0] ?? ""]: rate },
    });
    expect(foreign.status).toBe(400);
    expect(await foreign.json()).toEqual({ error: "invalid_rates" });
    const ownFile = await post(app, cookieA, {
      period: "2026-10",
      rates: Object.fromEntries(ids.map((id) => [id, rate])),
    });
    expect(ownFile.status).toBe(200);
    expect(gstr1FileSchema.parse(await ownFile.json())).toMatchObject({ rows: 3, excluded: [] });
  });
});
