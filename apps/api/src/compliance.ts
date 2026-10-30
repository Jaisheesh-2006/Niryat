import {
  creditNoteFor,
  disputeAlert,
  LOST_DISPUTE_OUTCOMES,
  realisationDeadline,
  realisationFor,
  toMinor,
} from "@niryat/rules";
import type { Invoice, InvoiceView } from "@niryat/shared";
import { indiaDate, rules } from "./rules";

export function toInvoiceView(
  invoice: Invoice,
  gstRegistered: boolean | null,
  today: string,
): InvoiceView {
  const realisation = realisationFor(
    {
      invoice,
      paidTotal: invoice.paidTotal,
      refundedTotal: invoice.refundedTotal,
      disputeLost: invoice.disputes.some(
        (dispute) => dispute.outcome !== null && LOST_DISPUTE_OUTCOMES.includes(dispute.outcome),
      ),
    },
    rules,
  );
  return {
    ...invoice,
    compliance: {
      realisation,
      deadline:
        toMinor(realisation.shortfall) > 0n ? realisationDeadline({ invoice, today }, rules) : null,
      creditNotes: invoice.refunds.flatMap((refund) => {
        const note = creditNoteFor(
          {
            gstRegistered,
            invoice,
            refund: {
              refundId: refund.paypalTxnId,
              date: indiaDate(refund.receivedAt),
              amount: refund.gross,
            },
          },
          rules,
        );
        return note ? [note] : [];
      }),
      disputeAlerts: invoice.disputes.map((dispute) =>
        disputeAlert(
          {
            invoiceNumber: invoice.number,
            paypalDisputeId: dispute.paypalDisputeId,
            amount: dispute.amount,
            currency: dispute.currency,
            responseDueDate: dispute.responseDueDate,
            outcome: dispute.outcome,
          },
          rules,
        ),
      ),
    },
  };
}
