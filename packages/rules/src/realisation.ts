import type { DisputeAlert, Realisation } from "@niryat/shared";
import { cite } from "./cite";
import type { RuleMetadata } from "./index";
import { financialYear } from "./invoice-number";
import { fromMinor, toMinor } from "./money";

export const LOST_DISPUTE_OUTCOMES: readonly string[] = ["RESOLVED_BUYER_FAVOUR", "ACCEPTED"];

const TAIL =
  " This reduces the export value only when your bank (AD bank) accepts it; for invoices up to Rs 10 lakh your declaration may be enough. Until then, treat it as unrealised.";

export function realisationFor(
  input: {
    invoice: { number: string; currency: string; amount: string };
    paidTotal: string;
    refundedTotal: string;
    disputeLost: boolean;
  },
  rules: readonly RuleMetadata[],
): Realisation {
  const { invoice } = input;
  const amount = toMinor(invoice.amount);
  const paid = toMinor(input.paidTotal);
  const refunded = toMinor(input.refundedTotal);
  const received = paid > refunded ? paid - refunded : 0n;
  return {
    exportValue: fromMinor(amount),
    received: fromMinor(received),
    shortfall: fromMinor(amount > received ? amount - received : 0n),
    adjustment: refunded > 0n || input.disputeLost ? "pending_bank" : "none",
    message:
      refunded > 0n
        ? `${invoice.currency} ${fromMinor(refunded)} of invoice ${invoice.number} was refunded to the client.${TAIL}`
        : input.disputeLost
          ? `The client won a dispute on invoice ${invoice.number}.${TAIL}`
          : null,
    citation: cite(rules, "REALISATION_ADJUSTMENT"),
  };
}

export function disputeAlert(
  input: {
    invoiceNumber: string;
    paypalDisputeId: string;
    amount: string;
    currency: string;
    responseDueDate: string | null;
    outcome: string | null;
  },
  rules: readonly RuleMetadata[],
): DisputeAlert {
  const lost = input.outcome !== null && LOST_DISPUTE_OUTCOMES.includes(input.outcome);
  const money = `${input.currency} ${fromMinor(toMinor(input.amount))}`;
  return {
    paypalDisputeId: input.paypalDisputeId,
    lost,
    message: lost
      ? `PayPal resolved the dispute on invoice ${input.invoiceNumber} in the buyer's favour. The export value is reduced only when your bank (AD bank) accepts it. Ask your bank to record the reduction.`
      : input.outcome !== null
        ? `PayPal resolved the dispute on invoice ${input.invoiceNumber} in your favour. The export value does not change.`
        : `Client disputed ${money} on invoice ${input.invoiceNumber}. This export may no longer count as realised.${input.responseDueDate === null ? "" : ` Respond in PayPal by ${input.responseDueDate}.`}`,
    citation: cite(rules, "REALISATION_ADJUSTMENT"),
  };
}

export function refundTask(
  input: {
    gstRegistered: boolean | null;
    invoice: { number: string; date: string; currency: string };
    refund: { date: string; amount: string };
  },
  rules: readonly RuleMetadata[],
): {
  message: string;
  dueDate: string | null;
  sourceRuleId: "CREDIT_NOTE" | "REALISATION_ADJUSTMENT";
} {
  const { invoice, refund } = input;
  const declareBy = `${Number(financialYear(invoice.date).slice(0, 4)) + 1}-11-30`;
  const creditNote = input.gstRegistered === true && refund.date <= declareBy;
  const sourceRuleId = creditNote ? "CREDIT_NOTE" : "REALISATION_ADJUSTMENT";
  cite(rules, sourceRuleId);
  const value = `${invoice.currency} ${fromMinor(toMinor(refund.amount))}`;
  return {
    message: creditNote
      ? `Refund of ${value} recorded on invoice ${invoice.number}. Consider issuing a GST credit note (declare it by ${declareBy}), and ask your bank (AD bank) to accept the reduced export value.`
      : `Refund of ${value} recorded on invoice ${invoice.number}. Ask your bank (AD bank) to accept the reduced export value.`,
    dueDate: creditNote ? declareBy : null,
    sourceRuleId,
  };
}
