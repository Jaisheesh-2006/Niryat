import {
  type Db,
  ensureTask,
  getInvoice,
  gstRegistration,
  paymentLink,
  recordPayment,
  recordRefund,
} from "@niryat/db";
import type { PayPalLedger } from "@niryat/paypal";
import { refundTask as refundTaskRule } from "@niryat/rules";
import { indiaDate, rules } from "./rules";

export async function recordCapture(
  deps: { db: Db; ledger: Pick<PayPalLedger, "getCapture"> },
  captureId: string,
): Promise<"recorded" | "not_completed" | "not_found"> {
  const capture = await deps.ledger.getCapture(captureId);
  if (!capture) return "not_found";
  if (!["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(capture.status)) {
    return "not_completed";
  }
  await recordPayment(deps.db, capture);
  return "recorded";
}

export async function recordRefundById(
  deps: { db: Db; ledger: Pick<PayPalLedger, "getCapture" | "getRefund"> },
  refundId: string,
): Promise<"recorded" | "not_completed" | "not_found"> {
  const refund = await deps.ledger.getRefund(refundId);
  if (!refund) return "not_found";
  if (refund.status !== "COMPLETED") return "not_completed";
  if (refund.captureId && (await paymentLink(deps.db, refund.captureId)) === undefined) {
    await recordCapture(deps, refund.captureId);
  }
  const link = await recordRefund(deps.db, refund);
  if (link.userId && link.invoiceId) {
    const invoice = await getInvoice(deps.db, link.userId, link.invoiceId);
    if (invoice) {
      const task = refundTaskRule(
        {
          gstRegistered: await gstRegistration(deps.db, link.userId),
          invoice,
          refund: { date: indiaDate(refund.createTime), amount: refund.gross },
        },
        rules,
      );
      await ensureTask(deps.db, {
        userId: link.userId,
        invoiceId: link.invoiceId,
        type: "refund_recorded",
        dueDate: task.dueDate,
        message: task.message,
        sourceRuleId: task.sourceRuleId,
        dedupeKey: `refund:${refund.refundId}`,
      });
    }
  }
  return "recorded";
}
