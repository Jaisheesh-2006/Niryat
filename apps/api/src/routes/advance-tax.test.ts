import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { advanceTaxSchedule } from "@niryat/rules";
import { advanceTaxSchema, type Invoice, profileInputSchema } from "@niryat/shared";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startSession } from "../auth/session";
import { createApp } from "../index";
import * as clock from "../rules";

const profile = profileInputSchema.parse({
  legalName: null,
  address: null,
  gstRegistered: false,
  gstin: null,
  lutNumber: null,
  lutValidFrom: null,
  lutValidTo: null,
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
  specifiedProfession: true,
});
const invoice: Invoice = {
  id: randomUUID(),
  clientId: randomUUID(),
  clientName: "Synthetic client",
  type: "one_time",
  number: "2026-27/0001",
  fy: "2026-27",
  date: "2026-10-01",
  currency: "USD",
  amount: "100.00",
  description: "Software",
  sac: "998314",
  recurrence: null,
  status: "paid",
  pdfUrl: null,
  paypalInvoiceId: null,
  paypalRecurringSeriesId: null,
  paidTotal: "100.00",
  payments: [
    {
      id: randomUUID(),
      paypalTxnId: "CAPTURE-A",
      gross: "100.00",
      fee: "1.00",
      net: "99.00",
      currency: "USD",
      fxRate: null,
      receivedAt: "2026-10-01T00:00:00Z",
      fira: null,
    },
  ],
  firaStatus: "pending",
  refundedTotal: "0.00",
  refunds: [],
  disputes: [],
  action: null,
  refundActions: [],
};

async function cookieFor(userId: string, secret: string) {
  const auth = new Hono();
  auth.get("/", async (c) => {
    await startSession(c, userId, secret, false);
    return c.json({ ok: true });
  });
  const cookie = (await auth.request("/")).headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected cookie");
  return cookie;
}

describe("advance-tax route with a fake ledger", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = createApp(deps);
  const userA = randomUUID();
  const userB = randomUUID();
  let cookieA: string;
  let cookieB: string;
  beforeAll(async () => {
    cookieA = await cookieFor(userA, deps.sessionSecret);
    cookieB = await cookieFor(userB, deps.sessionSecret);
  });
  beforeEach(() => {
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-10-31");
    vi.spyOn(db, "getProfile").mockResolvedValue(profile);
    vi.spyOn(db, "listInvoices").mockResolvedValue([invoice]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  function get(query = "", cookie = cookieA) {
    return app.request(`/advance-tax${query ? `?${query}` : ""}`, { headers: { Cookie: cookie } });
  }

  it("requires authentication before reading a profile or ledger", async () => {
    const response = await get("", "");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    expect(db.getProfile).not.toHaveBeenCalled();
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it("returns 404 when the signed-in user has no profile", async () => {
    vi.mocked(db.getProfile).mockResolvedValue(undefined);
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it.each([
    "taxYear=2026-28",
    "taxYear=2026",
    "taxYear=2026-27%0A",
    "taxYear=9999-00",
    "taxYear=",
    "rates=INR:1",
    "rates=usd:84",
    "rates=USD:1,USD:2",
    "rates=USD:0",
    "rates=USD:0.0000",
    "rates=USD:84.12345",
    "rates=USD:10000",
    "rates=USD:1e2",
    "rates=USD:-1",
    "rates=USD:84%0A",
    "rates=USD:1:2",
    "rates=USD:1,",
    "rates=USD",
    "rates=",
    "rates=USD:1&rates=EUR:1",
    "taxYear=2026-27&taxYear=2027-28",
    "estimatedTax=1&estimatedTax=2",
    "estimatedTax=-1",
    "estimatedTax=100000000001",
    "estimatedTax=1.5",
    "estimatedTax=1e3",
    "estimatedTax=invalid",
    "estimatedTax=1%0A",
    "estimatedTax=",
    "other=value",
  ])("rejects invalid query %s without exposing it", async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
    expect(db.getProfile).not.toHaveBeenCalled();
  });

  it.each([
    {
      specifiedProfession: null,
      gross: "100",
      rates: "",
      state: "uncertain",
      reason: "profession_unknown",
    },
    {
      specifiedProfession: false,
      gross: "100",
      rates: "",
      state: "not_eligible",
      reason: "not_specified_profession",
    },
    {
      specifiedProfession: true,
      gross: "100",
      rates: "",
      state: "uncertain",
      reason: "rate_missing",
    },
    {
      specifiedProfession: true,
      gross: "5000000",
      rates: "USD:1",
      state: "eligible",
      reason: null,
    },
    {
      specifiedProfession: true,
      gross: "5000000.01",
      rates: "USD:1",
      state: "uncertain",
      reason: "cash_share_unknown",
    },
    {
      specifiedProfession: true,
      gross: "7500000.00",
      rates: "USD:1",
      state: "uncertain",
      reason: "cash_share_unknown",
    },
    {
      specifiedProfession: true,
      gross: "7500000.01",
      rates: "USD:1",
      state: "not_eligible",
      reason: "over_limit",
    },
  ])(
    "returns the $reason eligibility branch",
    async ({ specifiedProfession, gross, rates, state, reason }) => {
      vi.mocked(db.getProfile).mockResolvedValue({ ...profile, specifiedProfession });
      vi.mocked(db.listInvoices).mockResolvedValue([
        {
          ...invoice,
          payments: invoice.payments.map((payment) => ({ ...payment, gross })),
        },
      ]);
      const query = new URLSearchParams({ taxYear: "2026-27", estimatedTax: "100000" });
      if (rates) query.set("rates", rates);
      const response = await get(query.toString());
      expect(response.status).toBe(200);
      const estimate = advanceTaxSchema.parse(await response.json());
      expect(estimate.eligibility).toMatchObject({ state, reason });
      expect(estimate.eligibility.citation.ruleId).toBe("PRESUMPTIVE_TAX");
      expect(estimate.schedule).toEqual(
        advanceTaxSchedule(
          {
            taxYear: "2026-27",
            presumptive: state === "eligible",
            estimatedTaxInr: "100000",
          },
          clock.rules,
        ).schedule,
      );
    },
  );

  it("defaults to the current IST tax year and returns a valid response without rates or an estimate", async () => {
    for (const [today, taxYear] of [
      ["2027-03-31", "2026-27"],
      ["2027-04-01", "2027-28"],
    ]) {
      vi.mocked(clock.todayInIndia).mockReturnValue(today ?? "");
      const response = await get();
      expect(response.status).toBe(200);
      expect(advanceTaxSchema.parse(await response.json())).toMatchObject({
        taxYear,
        estimatedTaxInr: null,
      });
    }
  });

  it.each(["0", "9000", "100000000000"])(
    "accepts whole-INR estimate %s with rules-produced amounts",
    async (estimatedTax) => {
      const response = await get(`rates=USD:84.10&estimatedTax=${estimatedTax}`);
      expect(response.status).toBe(200);
      const estimate = advanceTaxSchema.parse(await response.json());
      const expected = advanceTaxSchedule(
        { taxYear: "2026-27", presumptive: true, estimatedTaxInr: estimatedTax },
        clock.rules,
      );
      expect(estimate).toMatchObject({
        notPayable: expected.notPayable,
        schedule: expected.schedule,
      });
      if (estimatedTax === "9000") {
        expect(estimate.messages).toEqual([
          "Advance tax is not payable when the tax for the year is under 10000.",
        ]);
      }
    },
  );

  it("accepts all supported currencies and four decimal places for INR rates", async () => {
    const response = await get("rates=USD:84.1234,EUR:90.5,GBP:100,AUD:50,CAD:60");
    expect(response.status).toBe(200);
    expect(advanceTaxSchema.parse(await response.json()).grossReceiptsInr).toBe("8412.34");
  });

  it("reads only the authenticated user's profile and ledger", async () => {
    vi.mocked(db.getProfile).mockImplementation(async (_db, userId) =>
      userId === userA ? profile : { ...profile, specifiedProfession: false },
    );
    vi.mocked(db.listInvoices).mockImplementation(async (_db, userId) =>
      userId === userA ? [invoice] : [],
    );
    const a = await get("rates=USD:84.10", cookieA);
    const b = await get("rates=USD:84.10", cookieB);
    expect(advanceTaxSchema.parse(await a.json())).toMatchObject({
      receipts: [{ currency: "USD", payments: "100.00" }],
      grossReceiptsInr: "8410.00",
      eligibility: { state: "eligible" },
    });
    expect(advanceTaxSchema.parse(await b.json())).toMatchObject({
      receipts: [],
      grossReceiptsInr: "0.00",
      eligibility: { reason: "not_specified_profession" },
    });
    for (const userId of [userA, userB]) {
      expect(db.getProfile).toHaveBeenCalledWith(deps.db, userId, deps.encryptionKey);
      expect(db.listInvoices).toHaveBeenCalledWith(deps.db, userId);
    }
  });
});
