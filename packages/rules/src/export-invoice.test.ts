import { readFileSync } from "node:fs";
import { type ExportAnswers, type ProfileInput, profileInputSchema } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { LUT_ENDORSEMENT, prepareExportInvoice } from "./export-invoice";
import { parseRules, RULES_FILE_URL } from "./load";

const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
const profile: ProfileInput = {
  legalName: "Ananya Rao",
  address: "12 MG Road, Pune 411001",
  gstRegistered: true,
  gstin: "27ABCDE1234F1Z5",
  lutNumber: "AD271026000001",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: "Software development",
  purposeCode: "P0802",
  panLast4: "234F",
  expectedTurnoverInr: 1_800_000,
  gstr1Frequency: null,
  specifiedProfession: null,
};
const answers: ExportAnswers = {
  supplierInIndia: true,
  clientPresentInIndia: false,
  paidInForeignCurrency: true,
  sameEstablishment: false,
};
const client = { name: "Acme Inc", country: "US", address: "123 Main St, New York", answers };
const invoice = {
  number: "2026-27/0001",
  date: "2026-10-26",
  description: "Software development",
  sac: "998314",
  currency: "USD",
  amount: "100",
};

describe("export invoice preparation", () => {
  it.each([
    ["100", "USD 100.00"],
    ["1234.5", "USD 1234.50"],
    ["999999999.99", "USD 999999999.99"],
  ])("prepares all registered invoice rows for amount %s", (amount, money) => {
    const result = prepareExportInvoice(
      { profile, client, invoice: { ...invoice, amount } },
      { rules },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected invoice document");
    expect(result.document).toEqual({
      title: "Tax invoice",
      rows: [
        { label: "Supplier", value: "Ananya Rao" },
        { label: "Supplier address", value: "12 MG Road, Pune 411001" },
        { label: "Supplier GSTIN", value: "27ABCDE1234F1Z5" },
        { label: "Invoice number", value: "2026-27/0001" },
        { label: "Invoice date", value: "2026-10-26" },
        { label: "Recipient", value: "Acme Inc" },
        { label: "Recipient address", value: "123 Main St, New York" },
        { label: "Delivery address", value: "123 Main St, New York" },
        { label: "Country of destination", value: "United States (US)" },
        { label: "Place of supply", value: "Outside India" },
        { label: "SAC", value: "998314" },
        { label: "Description of service", value: "Software development" },
        { label: "Taxable value", value: money },
        { label: "IGST rate", value: "0% (export under LUT)" },
        { label: "IGST amount", value: "USD 0.00" },
        { label: "Total invoice value", value: money },
        { label: "Reverse charge", value: "No" },
        { label: "LUT reference", value: "AD271026000001, valid 2026-04-01 to 2027-03-31" },
        { label: "Authorised signatory", value: "Ananya Rao" },
      ],
      endorsement: LUT_ENDORSEMENT,
      citation: {
        ruleId: "EXPORT_INVOICE_FIELDS",
        source: "CGST Rules r. 46 and export proviso (amended by Notfn 20/2024-CT)",
        effectiveFrom: "2024-11-01",
      },
    });
    expect(LUT_ENDORSEMENT).toBe(
      "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX",
    );
  });

  it.each([null, "AD27₹001"])(
    "prepares an unregistered invoice without GSTIN, IGST or LUT rows (LUT %s)",
    (lutNumber) => {
      const result = prepareExportInvoice(
        {
          profile: {
            ...profile,
            gstRegistered: false,
            gstin: null,
            lutNumber,
            lutValidFrom: null,
            lutValidTo: null,
          },
          client,
          invoice,
        },
        { rules },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected invoice document");
      expect(result.document.title).toBe("Invoice");
      expect(result.document.endorsement).toBeNull();
      expect(result.document.rows.map((row) => row.label)).toEqual([
        "Supplier",
        "Supplier address",
        "Invoice number",
        "Invoice date",
        "Recipient",
        "Recipient address",
        "Delivery address",
        "Country of destination",
        "Place of supply",
        "SAC",
        "Description of service",
        "Taxable value",
        "Total invoice value",
        "Reverse charge",
        "GST registration",
        "Authorised signatory",
      ]);
      expect(result.document.rows).toContainEqual({
        label: "GST registration",
        value: "Supplier is not registered under GST.",
      });
    },
  );

  it.each(["AD27₹001", "AD27株式会社001", "AD27\t001"])(
    "blocks a saved LUT reference the PDF cannot print (%s)",
    (lutNumber) => {
      const savedProfile = profileInputSchema.parse({ ...profile, lutNumber });
      expect(prepareExportInvoice({ profile: savedProfile, client, invoice }, { rules })).toEqual({
        ok: false,
        reasons: [
          "The LUT reference has characters the invoice PDF cannot print. Edit the LUT reference in your profile.",
        ],
      });
    },
  );

  it.each(["AD271026000001", "Café001"])("allows a printable LUT reference (%s)", (lutNumber) => {
    expect(
      prepareExportInvoice({ profile: { ...profile, lutNumber }, client, invoice }, { rules }).ok,
    ).toBe(true);
  });

  it.each<{
    name: string;
    profileChanges?: Partial<ProfileInput>;
    clientChanges?: {
      country?: string;
      address?: string | null;
      name?: string;
      answers?: ExportAnswers;
    };
    reasons: string[];
  }>([
    {
      name: "India recipient",
      clientChanges: { country: "IN" },
      reasons: [
        "The client is in India. PayPal also blocks invoices to India-based recipients.",
        "The client is in India, so the place of supply is India.",
      ],
    },
    {
      name: "LUT expired on the invoice date",
      profileChanges: { lutValidTo: "2026-10-25" },
      reasons: [
        "Your LUT expired on 2026-10-25. File a new LUT (FORM GST RFD-11) before your next export invoice.",
      ],
    },
    {
      name: "missing LUT",
      profileChanges: { lutNumber: null },
      reasons: [
        "No LUT on file. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund.",
      ],
    },
    {
      name: "LUT not yet valid",
      profileChanges: { lutValidFrom: "2026-10-27" },
      reasons: ["Your LUT is valid only from 2026-10-27. Exports before then are not covered."],
    },
    {
      name: "missing GSTIN",
      profileChanges: { gstin: null },
      reasons: ["GSTIN missing. Export invoices must show your GSTIN."],
    },
    {
      name: "missing supplier and recipient particulars",
      profileChanges: { legalName: null, address: null },
      clientChanges: { address: null },
      reasons: [
        "Add your legal name to your profile. Invoices must show the supplier's name.",
        "Add your business address to your profile. Invoices must show the supplier's address.",
        "Add the client's address. Export invoices must show the recipient's address and the delivery address.",
      ],
    },
    {
      name: "legacy client name the PDF cannot print",
      clientChanges: { name: "株式会社" },
      reasons: [
        "The client name has characters the invoice PDF cannot print. Edit the client name.",
      ],
    },
    {
      name: "unknown export answer",
      clientChanges: { answers: { ...answers, supplierInIndia: null } },
      reasons: ["Answer: do you supply this service from India?"],
    },
    {
      name: "all applicable reasons in plan order",
      profileChanges: {
        lutNumber: "AD27₹001",
        lutValidFrom: null,
        gstin: null,
        legalName: null,
        address: null,
      },
      clientChanges: { country: "IN", address: null, name: "株式会社" },
      reasons: [
        "The client is in India. PayPal also blocks invoices to India-based recipients.",
        "The client is in India, so the place of supply is India.",
        "No LUT on file. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund.",
        "The LUT reference has characters the invoice PDF cannot print. Edit the LUT reference in your profile.",
        "GSTIN missing. Export invoices must show your GSTIN.",
        "Add your legal name to your profile. Invoices must show the supplier's name.",
        "Add your business address to your profile. Invoices must show the supplier's address.",
        "Add the client's address. Export invoices must show the recipient's address and the delivery address.",
        "The client name has characters the invoice PDF cannot print. Edit the client name.",
      ],
    },
  ])("blocks $name", ({ profileChanges, clientChanges, reasons }) => {
    expect(
      prepareExportInvoice(
        {
          profile: { ...profile, ...profileChanges },
          client: { ...client, ...clientChanges },
          invoice,
        },
        { rules },
      ),
    ).toEqual({ ok: false, reasons });
  });

  it.each(["2026-10-26", "2026-11-05"])(
    "allows a LUT valid through %s, including a low-severity renewal warning",
    (lutValidTo) => {
      expect(
        prepareExportInvoice({ profile: { ...profile, lutValidTo }, client, invoice }, { rules })
          .ok,
      ).toBe(true);
    },
  );
});
