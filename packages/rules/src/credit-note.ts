import type { CreditNote } from "@niryat/shared";
import { cite } from "./cite";
import type { RuleMetadata } from "./index";
import { financialYear } from "./invoice-number";
import { fromMinor, toMinor } from "./money";

export function creditNoteFor(
  input: {
    gstRegistered: boolean | null;
    invoice: { number: string; date: string; currency: string };
    refund: { refundId: string; date: string; amount: string };
  },
  rules: readonly RuleMetadata[],
): CreditNote | null {
  if (input.gstRegistered !== true) return null;
  const { invoice, refund } = input;
  const declareBy = `${Number(financialYear(invoice.date).slice(0, 4)) + 1}-11-30`;
  const late = refund.date > declareBy;
  const value = `${invoice.currency} ${fromMinor(toMinor(refund.amount))}`;
  return {
    refundId: refund.refundId,
    originalInvoice: invoice.number,
    originalDate: invoice.date,
    value,
    igst: `${invoice.currency} 0.00`,
    declareBy,
    late,
    message: late
      ? `The last date to declare a credit note against invoice ${invoice.number} was ${declareBy}. Ask your CA how to treat this refund.`
      : `You may issue a GST credit note for ${value} against invoice ${invoice.number}. Declare it in GSTR-1 by ${declareBy}, or by your annual return date if that is earlier. Under LUT there is no IGST to adjust; the credit note corrects the export value.`,
    citation: cite(rules, "CREDIT_NOTE"),
  };
}
