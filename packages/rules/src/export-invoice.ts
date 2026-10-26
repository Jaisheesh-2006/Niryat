import {
  type ExportAnswers,
  PDF_TEXT_PATTERN,
  type ProfileInput,
  type RuleCitation,
} from "@niryat/shared";
import { cite } from "./cite";
import { checkExportConditions } from "./export-conditions";
import { checkLut } from "./health";
import type { RuleMetadata } from "./index";

export const LUT_ENDORSEMENT =
  "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX";

export interface ExportInvoiceDocument {
  title: "Tax invoice" | "Invoice";
  rows: readonly { label: string; value: string }[];
  endorsement: string | null;
  citation: RuleCitation;
}

export function prepareExportInvoice(
  input: {
    profile: ProfileInput;
    client: {
      name: string;
      country: string;
      address: string | null;
      answers: ExportAnswers;
    };
    invoice: {
      number: string;
      date: string;
      description: string;
      sac: string;
      currency: string;
      amount: string;
    };
  },
  options: { rules: readonly RuleMetadata[] },
): { ok: true; document: ExportInvoiceDocument } | { ok: false; reasons: string[] } {
  const { profile, client, invoice } = input;
  const { rules } = options;
  const { legalName, address, gstRegistered, gstin } = profile;
  const exportCheck = checkExportConditions(client, { today: invoice.date, rules });
  const reasons = exportCheck.conditions
    .filter((condition) => condition.status !== "pass")
    .map((condition) => condition.message);
  reasons.push(
    ...checkLut(profile, invoice.date, rules)
      .filter((flag) => flag.severity === "high")
      .map((flag) => flag.message),
  );
  if (gstRegistered && profile.lutNumber !== null && !PDF_TEXT_PATTERN.test(profile.lutNumber)) {
    reasons.push(
      "The LUT reference has characters the invoice PDF cannot print. Edit the LUT reference in your profile.",
    );
  }
  if (gstRegistered && gstin === null) {
    reasons.push("GSTIN missing. Export invoices must show your GSTIN.");
  }
  if (legalName === null) {
    reasons.push("Add your legal name to your profile. Invoices must show the supplier's name.");
  }
  if (address === null) {
    reasons.push(
      "Add your business address to your profile. Invoices must show the supplier's address.",
    );
  }
  if (client.address === null) {
    reasons.push(
      "Add the client's address. Export invoices must show the recipient's address and the delivery address.",
    );
  }
  if (!PDF_TEXT_PATTERN.test(client.name)) {
    reasons.push(
      "The client name has characters the invoice PDF cannot print. Edit the client name.",
    );
  }
  if (reasons.length > 0 || legalName === null || address === null || client.address === null) {
    return { ok: false, reasons };
  }

  // shortcut: values stay in the invoice currency; add INR conversion when CGST r. 34 is source-checked.
  const [whole, fraction = ""] = invoice.amount.split(".");
  const money = `${invoice.currency} ${whole}.${fraction.padEnd(2, "0")}`;
  const countryName = new Intl.DisplayNames("en", { type: "region" }).of(client.country);
  const rows = [
    { label: "Supplier", value: legalName },
    { label: "Supplier address", value: address },
  ];
  if (gstRegistered && gstin !== null) rows.push({ label: "Supplier GSTIN", value: gstin });
  rows.push(
    { label: "Invoice number", value: invoice.number },
    { label: "Invoice date", value: invoice.date },
    { label: "Recipient", value: client.name },
    { label: "Recipient address", value: client.address },
    { label: "Delivery address", value: client.address },
    { label: "Country of destination", value: `${countryName} (${client.country})` },
    { label: "Place of supply", value: "Outside India" },
    { label: "SAC", value: invoice.sac },
    { label: "Description of service", value: invoice.description },
    { label: "Taxable value", value: money },
  );
  if (gstRegistered) {
    rows.push(
      { label: "IGST rate", value: "0% (export under LUT)" },
      { label: "IGST amount", value: `${invoice.currency} 0.00` },
    );
  }
  rows.push(
    { label: "Total invoice value", value: money },
    { label: "Reverse charge", value: "No" },
  );
  if (gstRegistered) {
    rows.push({
      label: "LUT reference",
      value: `${profile.lutNumber}, valid ${profile.lutValidFrom} to ${profile.lutValidTo}`,
    });
  } else {
    rows.push({ label: "GST registration", value: "Supplier is not registered under GST." });
  }
  rows.push({ label: "Authorised signatory", value: legalName });
  return {
    ok: true,
    document: {
      title: gstRegistered ? "Tax invoice" : "Invoice",
      rows,
      endorsement: gstRegistered ? LUT_ENDORSEMENT : null,
      citation: cite(rules, "EXPORT_INVOICE_FIELDS"),
    },
  };
}
