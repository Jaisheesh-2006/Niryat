import { financialYear, formatSignedMinor, toMinor } from "@niryat/rules";
import type { Dashboard, HealthReport, InvoiceView, Refund } from "@niryat/shared";
import { indiaDate } from "./rules";

export function buildDashboard(
  input: { views: readonly InvoiceView[]; health: HealthReport | null },
  today: string,
): Dashboard {
  const ledgerRow = (
    view: InvoiceView,
    kind: "payment" | "refund",
    row: Pick<Refund, "id" | "gross" | "fee" | "net" | "currency" | "receivedAt">,
    paypalFxRate: string | null,
  ) => {
    const date = indiaDate(row.receivedAt);
    return {
      paymentId: row.id,
      kind,
      date,
      month: date.slice(0, 7),
      financialYear: financialYear(date),
      invoiceNumber: view.number,
      clientName: view.clientName,
      currency: row.currency,
      gross: row.gross,
      signedGross: kind === "refund" ? formatSignedMinor(-toMinor(row.gross)) : row.gross,
      fee: row.fee,
      net: row.net,
      paypalFxRate,
    };
  };
  return {
    asOf: today,
    health: input.health,
    payments: input.views.flatMap((view) => [
      ...view.payments.map((payment) => ledgerRow(view, "payment", payment, payment.fxRate)),
      ...view.refunds.map((refund) => ledgerRow(view, "refund", refund, null)),
    ]),
    invoices: input.views.map((view) => ({
      invoiceId: view.id,
      number: view.number,
      date: view.date,
      financialYear: view.fy,
      clientName: view.clientName,
      status: view.status,
      currency: view.currency,
      amount: view.amount,
      received: view.compliance.realisation.received,
      shortfall: view.compliance.realisation.shortfall,
      deadline: view.compliance.deadline?.deadline ?? null,
      daysRemaining: view.compliance.deadline?.daysRemaining ?? null,
      overdue: view.compliance.deadline?.overdue ?? false,
      firaStatus: view.firaStatus,
    })),
    disputes: input.views.flatMap((view) =>
      view.disputes.map((dispute) => ({
        paypalDisputeId: dispute.paypalDisputeId,
        invoiceNumber: view.number,
        clientName: view.clientName,
        status: dispute.status,
        reason: dispute.reason,
        currency: dispute.currency,
        amount: dispute.amount,
        responseDueDate: dispute.responseDueDate,
      })),
    ),
  };
}
