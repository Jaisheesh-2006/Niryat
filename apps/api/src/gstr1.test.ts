import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { gstr1ExportRows } from "@niryat/rules";
import { type Invoice, profileInputSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gstr1Csv, gstr1Preview } from "./gstr1";
import { rules } from "./rules";

const profile = profileInputSchema.parse({
  legalName: null,
  address: null,
  gstRegistered: true,
  gstin: null,
  lutNumber: "LUT",
  lutValidFrom: "2026-10-01",
  lutValidTo: "2027-03-31",
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
  gstr1Frequency: "monthly",
});

function invoice(number: string, amount: string, currency: Invoice["currency"] = "USD"): Invoice {
  return {
    id: randomUUID(),
    clientId: randomUUID(),
    clientName: "Synthetic client",
    type: "one_time",
    number,
    fy: "2026-27",
    date: "2026-10-15",
    currency,
    amount,
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
}

describe("GSTR-1 preview and CSV", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = { db: database.db, encryptionKey: randomBytes(32) };
  beforeEach(() => {
    vi.spyOn(db, "getProfile").mockResolvedValue(profile);
    vi.spyOn(db, "listInvoices").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  it.each([
    { value: undefined, error: "not_found", status: 404 },
    { value: { ...profile, gstRegistered: false }, error: "not_gst_registered", status: 403 },
    { value: { ...profile, gstr1Frequency: null }, error: "gstr1_frequency_missing", status: 409 },
  ])("returns $error before reading invoices", async ({ value, error, status }) => {
    vi.mocked(db.getProfile).mockResolvedValue(value);
    expect(await gstr1Preview(deps, "user-a", undefined, "2026-11-01")).toEqual({
      ok: false,
      error,
      status,
    });
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it.each(["2026-27-Q3", "2026-13", "2026-28-Q3", "2026-00"])(
    "rejects period %s",
    async (period) => {
      expect(await gstr1Preview(deps, "user-a", period, "2026-11-01")).toEqual({
        ok: false,
        error: "invalid_period",
        status: 400,
      });
    },
  );

  it("defaults to the latest closed monthly or quarterly period", async () => {
    const monthly = await gstr1Preview(deps, "user-a", undefined, "2026-11-01");
    expect(monthly).toMatchObject({
      ok: true,
      preview: { period: "2026-10", dueDate: "2026-11-11" },
    });
    vi.mocked(db.getProfile).mockResolvedValue({ ...profile, gstr1Frequency: "quarterly" });
    expect(await gstr1Preview(deps, "user-a", undefined, "2026-10-31")).toMatchObject({
      ok: true,
      preview: { period: "2026-27-Q2", dueDate: "2026-10-13" },
    });
  });

  it("reconciles currencies and separates invoices from refunds across IST periods", async () => {
    const a = invoice("2026-27/0002", "100.10");
    a.refunds = [
      {
        id: randomUUID(),
        paypalTxnId: "REFUND-A",
        captureId: null,
        gross: "80.05",
        fee: null,
        net: null,
        currency: "USD",
        receivedAt: "2026-10-20T12:00:00Z",
      },
      {
        id: randomUUID(),
        paypalTxnId: "REFUND-B",
        captureId: null,
        gross: "20.05",
        fee: null,
        net: null,
        currency: "USD",
        receivedAt: "2026-10-31T20:00:00Z",
      },
    ];
    a.refundedTotal = "100.10";
    const b = invoice("2026-27/0001", "50.20");
    b.date = "2026-10-01";
    b.status = "paid";
    const c = invoice("2026-27/0003", "12.30", "EUR");
    c.date = "2026-10-31";
    const outside = invoice("2026-27/0004", "900.00");
    outside.date = "2026-09-30";
    vi.mocked(db.listInvoices).mockResolvedValue([a, b, c, outside]);
    const october = await gstr1Preview(deps, "user-a", "2026-10", "2026-11-15");
    if (!october.ok) throw new Error("Expected preview");
    expect(october.preview.invoices.map((row) => row.number)).toEqual([
      b.number,
      a.number,
      c.number,
    ]);
    expect(october.preview.invoices.every((row) => row.lutCovered)).toBe(true);
    expect(october.preview.totals).toEqual([
      { currency: "EUR", invoices: "12.30", refunds: "0.00", net: "12.30" },
      { currency: "USD", invoices: "150.30", refunds: "80.05", net: "70.25" },
    ]);
    expect(october.preview.refunds).toHaveLength(1);
    expect(october.preview.refunds[0]?.creditNote).toMatchObject({
      refundId: "REFUND-A",
      originalInvoice: a.number,
    });
    const november = await gstr1Preview(deps, "user-a", "2026-11", "2026-11-15");
    if (!november.ok) throw new Error("Expected preview");
    expect(november.preview.invoices).toEqual([]);
    expect(november.preview.refunds).toMatchObject([{ refundId: "REFUND-B", date: "2026-11-01" }]);
    expect(november.preview.totals).toEqual([
      { currency: "USD", invoices: "0.00", refunds: "20.05", net: "-20.05" },
    ]);
    expect(db.listInvoices).toHaveBeenCalledWith(deps.db, "user-a");
  });

  it("flags absent LUT bounds and invoices outside the inclusive bounds", async () => {
    const a = invoice("2026-27/0001", "10.00");
    a.date = "2026-09-30";
    vi.mocked(db.listInvoices).mockResolvedValue([a]);
    expect(await gstr1Preview(deps, "user-a", "2026-09", "2026-11-01")).toMatchObject({
      preview: { invoices: [{ lutCovered: false }] },
    });
    vi.mocked(db.getProfile).mockResolvedValue({ ...profile, lutValidFrom: null });
    a.date = "2026-10-01";
    expect(await gstr1Preview(deps, "user-a", "2026-10", "2026-11-01")).toMatchObject({
      preview: { invoices: [{ lutCovered: false }] },
    });
  });

  it("writes exactly the export template with explicit rates, blank tax-payment fields and CRLF", () => {
    const file = gstr1ExportRows(
      {
        invoices: [
          {
            invoiceId: randomUUID(),
            number: "2026-27/0001",
            date: "2026-10-15",
            amount: "100.00",
            inrRate: "84.1234",
            gstRate: "18",
          },
          {
            invoiceId: randomUUID(),
            number: "2026-27/0002",
            date: "2026-10-16",
            amount: "1.00",
            inrRate: "84.1234",
            gstRate: "0",
          },
          {
            invoiceId: randomUUID(),
            number: "2026-27/0003",
            date: "2026-09-30",
            amount: "100.00",
            inrRate: null,
            gstRate: null,
          },
        ],
        lut: { from: "2026-10-01", to: "2027-03-31" },
      },
      rules,
    );
    expect(gstr1Csv(file.rows)).toBe(
      "Export Type,Invoice Number,Invoice date,Invoice Value,Port Code,Shipping Bill Number,Shipping Bill Date,Rate,Taxable Value,Cess Amount\r\n" +
        "WOPAY,2026-27/0001,15-Oct-2026,8412.34,,,,18.00,8412.34,\r\n" +
        "WOPAY,2026-27/0002,16-Oct-2026,84.12,,,,0.00,84.12,\r\n",
    );
    expect(file.excluded).toMatchObject([{ number: "2026-27/0003" }]);
    expect(file.totalInr).toBe("8496.46");
    const row = file.rows[0];
    if (!row) throw new Error("Expected row");
    expect(gstr1Csv([{ ...row, date: "2026-09-15" }])).toContain(",15-Sep-2026,");
    expect(gstr1Csv([{ ...row, number: 'value,"quoted"\nline' }])).toContain(
      '"value,""quoted""\nline"',
    );
  });

  it("propagates infrastructure failures", async () => {
    vi.mocked(db.listInvoices).mockRejectedValue(new Error("Invoice lookup failed"));
    await expect(gstr1Preview(deps, "user-a", "2026-10", "2026-11-01")).rejects.toThrow(
      "Invoice lookup failed",
    );
  });
});
