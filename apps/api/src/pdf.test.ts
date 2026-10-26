import { prepareExportInvoice } from "@niryat/rules";
import { PageSizes, PDFDocument, PDFPage } from "pdf-lib";
import { afterEach, expect, it, vi } from "vitest";
import { renderInvoicePdf } from "./pdf";
import { rules } from "./rules";

const input: Parameters<typeof prepareExportInvoice>[0] = {
  profile: {
    legalName: "Ananya Rao",
    address: "12 MG Road\nPune 411001",
    gstRegistered: true,
    gstin: "27ABCDE1234F1Z5",
    lutNumber: "AD271026000001",
    lutValidFrom: "2026-04-01",
    lutValidTo: "2027-03-31",
    workType: "Software development",
    purposeCode: "P0802",
    panLast4: "234F",
    expectedTurnoverInr: 1_800_000,
  },
  client: {
    name: "Acme Inc",
    country: "US",
    address: "123 Main St\nNew York",
    answers: {
      supplierInIndia: true,
      clientPresentInIndia: false,
      paidInForeignCurrency: true,
      sameEstablishment: false,
    },
  },
  invoice: {
    number: "2026-27/0001",
    date: "2026-10-26",
    description: "Software development",
    sac: "998314",
    currency: "USD",
    amount: "100.00",
  },
};

afterEach(() => vi.restoreAllMocks());

it.each([true, false])(
  "renders a reloadable A4 invoice (GST registered: %s)",
  async (gstRegistered) => {
    const result = prepareExportInvoice(
      { ...input, profile: { ...input.profile, gstRegistered } },
      { rules },
    );
    if (!result.ok) throw new Error("Expected printable invoice");
    const draw = vi.spyOn(PDFPage.prototype, "drawText");
    const bytes = await renderInvoicePdf(result.document);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe(input.invoice.number);
    expect(pdf.getCreator()).toBe("Niryat");
    expect(pdf.getProducer()).toBe("Niryat");
    expect(pdf.getPage(0).getSize()).toEqual({ width: PageSizes.A4[0], height: PageSizes.A4[1] });
    const text = draw.mock.calls.map(([value]) => value).join("\n");
    expect(text).toContain(result.document.title);
    expect(text).toContain("Supplier: Ananya Rao");
    expect(text).toContain("Total invoice value: USD 100.00");
    expect(text).toContain(`Rule ${result.document.citation.ruleId}:`);
    expect(text).toContain("Verify with your CA.");
    if (result.document.endorsement) {
      expect(text.replace(/\s+/g, " ")).toContain(result.document.endorsement);
    } else {
      expect(text).not.toContain("SUPPLY MEANT FOR EXPORT");
    }
  },
);

it("wraps long words, respects margins and continues on another page when needed", async () => {
  const result = prepareExportInvoice(input, { rules });
  if (!result.ok) throw new Error("Expected printable invoice");
  const draw = vi.spyOn(PDFPage.prototype, "drawText");
  const bytes = await renderInvoicePdf({
    ...result.document,
    rows: [
      ...result.document.rows,
      { label: "Long address", value: "W".repeat(500) },
      ...Array.from({ length: 50 }, () => ({ label: "Continuation", value: "Next line" })),
    ],
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  for (const [text, options] of draw.mock.calls) {
    if (!options?.font || options.size === undefined) throw new Error("Expected font and size");
    expect(options.font.widthOfTextAtSize(text, options.size)).toBeLessThanOrEqual(
      PageSizes.A4[0] - 80,
    );
    expect(options.y).toBeGreaterThanOrEqual(40);
    expect(options.y).toBeLessThanOrEqual(PageSizes.A4[1] - 40);
  }
});
