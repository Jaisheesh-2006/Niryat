import { readFileSync } from "node:fs";
import { creditNoteSchema } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { cite } from "./cite";
import { creditNoteFor } from "./credit-note";
import { parseRules, RULES_FILE_URL } from "./load";

const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
const invoice = { number: "2026-27/0001", date: "2026-10-26", currency: "USD" };
const refund = { refundId: "REFUND-1", date: "2026-10-27", amount: "40" };

describe("credit-note data", () => {
  it.each([
    ["2026-10-26", "2027-11-30"],
    ["2027-03-31", "2027-11-30"],
    ["2027-04-01", "2028-11-30"],
    ["2099-04-01", "2100-11-30"],
  ])("uses the original invoice's financial year for %s", (date, declareBy) => {
    const result = creditNoteFor(
      { gstRegistered: true, invoice: { ...invoice, date }, refund },
      rules,
    );
    expect(result).toEqual({
      refundId: "REFUND-1",
      originalInvoice: invoice.number,
      originalDate: date,
      value: "USD 40.00",
      igst: "USD 0.00",
      declareBy,
      late: false,
      message: `You may issue a GST credit note for USD 40.00 against invoice 2026-27/0001. Declare it in GSTR-1 by ${declareBy}, or by your annual return date if that is earlier. Under LUT there is no IGST to adjust; the credit note corrects the export value.`,
      citation: cite(rules, "CREDIT_NOTE"),
    });
    expect(creditNoteSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    ["2027-11-30", false],
    ["2027-12-01", true],
  ])("checks the deadline inclusively on %s", (date, late) => {
    const result = creditNoteFor(
      { gstRegistered: true, invoice, refund: { ...refund, date } },
      rules,
    );
    expect(result?.late).toBe(late);
    expect(result?.message).toBe(
      late
        ? "The last date to declare a credit note against invoice 2026-27/0001 was 2027-11-30. Ask your CA how to treat this refund."
        : "You may issue a GST credit note for USD 40.00 against invoice 2026-27/0001. Declare it in GSTR-1 by 2027-11-30, or by your annual return date if that is earlier. Under LUT there is no IGST to adjust; the credit note corrects the export value.",
    );
    expect(result?.citation).toEqual(cite(rules, "CREDIT_NOTE"));
  });

  it.each([false, null])("returns no credit note for gstRegistered=%s", (gstRegistered) => {
    expect(creditNoteFor({ gstRegistered, invoice, refund }, rules)).toBeNull();
  });
});
