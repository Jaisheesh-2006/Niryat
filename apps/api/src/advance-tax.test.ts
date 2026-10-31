import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { advanceTaxSchedule } from "@niryat/rules";
import { type Invoice, type Payment, profileInputSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceTaxEstimate } from "./advance-tax";
import { rules } from "./rules";

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

function payment(gross: string, receivedAt: string, currency = "USD"): Payment {
  return {
    id: randomUUID(),
    paypalTxnId: randomUUID(),
    gross,
    fee: "1.00",
    net: null,
    currency,
    fxRate: null,
    receivedAt,
    fira: null,
  };
}

function invoice(payments: Payment[], refunds: Invoice["refunds"] = []): Invoice {
  return {
    id: randomUUID(),
    clientId: randomUUID(),
    clientName: "Synthetic client",
    type: "one_time",
    number: "2025-26/0001",
    fy: "2025-26",
    date: "2025-10-01",
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
    payments,
    firaStatus: "pending",
    refundedTotal: "0.00",
    refunds,
    disputes: [],
    action: null,
    refundActions: [],
  };
}

describe("advance-tax estimate", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = { db: database.db, encryptionKey: randomBytes(32) };
  const input = { taxYear: "2026-27", rates: { USD: "84.10" }, estimatedTaxInr: null };
  beforeEach(() => {
    vi.spyOn(db, "getProfile").mockResolvedValue(profile);
    vi.spyOn(db, "listInvoices").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  it("returns 404 without a profile before reading the ledger", async () => {
    vi.mocked(db.getProfile).mockResolvedValue(undefined);
    expect(await advanceTaxEstimate(deps, "user-a", input)).toEqual({
      ok: false,
      error: "not_found",
      status: 404,
    });
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it("uses IST receipt dates, including both tax-year edges, independently of invoice dates", async () => {
    vi.mocked(db.listInvoices).mockResolvedValue([
      invoice([
        payment("1000", "2026-03-31T18:29:59Z"),
        payment("10", "2026-03-31T18:30:00Z"),
        payment("20", "2027-03-31T18:29:59Z"),
        payment("30", "2027-03-31T19:00:00Z"),
      ]),
    ]);
    expect(await advanceTaxEstimate(deps, "user-a", input)).toMatchObject({
      ok: true,
      estimate: { receipts: [{ currency: "USD", payments: "30.00" }], grossReceiptsInr: "2523.00" },
    });
    expect(
      await advanceTaxEstimate(deps, "user-a", { ...input, taxYear: "2027-28" }),
    ).toMatchObject({
      ok: true,
      estimate: { receipts: [{ currency: "USD", payments: "30.00" }] },
    });
  });

  it("sums gross payments across invoices, subtracts refunds and floors each signed net for INR", async () => {
    const refund = (amount: string, currency = "USD", receivedAt = "2026-10-02T00:00:00Z") => ({
      ...payment(amount, receivedAt, currency),
      captureId: null,
    });
    vi.mocked(db.listInvoices).mockResolvedValue([
      invoice(
        [payment("100.10", "2026-10-01T00:00:00Z")],
        [refund("30.05"), refund("2.00", "EUR")],
      ),
      invoice(
        [payment("50.20", "2026-10-01T00:00:00Z")],
        [
          refund("10.00"),
          refund("9999", "USD", "2026-03-31T18:29:59Z"),
          refund("9999", "USD", "2027-03-31T18:30:00Z"),
        ],
      ),
    ]);
    expect(
      await advanceTaxEstimate(deps, "user-a", { ...input, rates: { USD: "84.1234", EUR: "90" } }),
    ).toMatchObject({
      ok: true,
      estimate: {
        receipts: [
          { currency: "EUR", payments: "0.00", refunds: "2.00", net: "-2.00" },
          { currency: "USD", payments: "150.30", refunds: "40.05", net: "110.25" },
        ],
        grossReceiptsInr: "9274.60",
        deemedIncomeInr: "4637.30",
      },
    });
  });

  it("requires a rate for every currency, including a refund-only currency", async () => {
    vi.mocked(db.listInvoices).mockResolvedValue([
      invoice(
        [],
        [
          {
            ...payment("2", "2026-10-01T00:00:00Z", "EUR"),
            captureId: null,
          },
        ],
      ),
    ]);
    expect(await advanceTaxEstimate(deps, "user-a", input)).toMatchObject({
      ok: true,
      estimate: {
        grossReceiptsInr: null,
        deemedIncomeInr: null,
        eligibility: { reason: "rate_missing" },
      },
    });
  });

  it("returns zero receipts for an empty ledger and includes both citations", async () => {
    const result = await advanceTaxEstimate(deps, "user-a", input);
    expect(result).toMatchObject({
      ok: true,
      estimate: {
        receipts: [],
        grossReceiptsInr: "0.00",
        deemedIncomeInr: "0.00",
        messages: [
          "Enter your estimated tax for the year to see instalment amounts. Niryat does not calculate income tax.",
        ],
        citations: [{ ruleId: "PRESUMPTIVE_TAX" }, { ruleId: "ADVANCE_TAX_DATES" }],
      },
    });
    expect(db.getProfile).toHaveBeenCalledWith(deps.db, "user-a", deps.encryptionKey);
    expect(db.listInvoices).toHaveBeenCalledWith(deps.db, "user-a");
  });

  it.each([true, false])(
    "passes eligibility %s and the estimate to the rules schedule",
    async (specifiedProfession) => {
      vi.mocked(db.getProfile).mockResolvedValue({ ...profile, specifiedProfession });
      for (const estimatedTaxInr of [null, "0", "9000", "100000"]) {
        const result = await advanceTaxEstimate(deps, "user-a", { ...input, estimatedTaxInr });
        const expected = advanceTaxSchedule(
          { taxYear: input.taxYear, presumptive: specifiedProfession, estimatedTaxInr },
          rules,
        );
        expect(result).toMatchObject({
          ok: true,
          estimate: {
            estimatedTaxInr,
            notPayable: expected.notPayable,
            schedule: expected.schedule,
            messages: expected.message === null ? [] : [expected.message],
          },
        });
      }
    },
  );

  it("propagates infrastructure failures", async () => {
    vi.mocked(db.listInvoices).mockRejectedValue(new Error("Invoice lookup failed"));
    await expect(advanceTaxEstimate(deps, "user-a", input)).rejects.toThrow(
      "Invoice lookup failed",
    );
  });
});
