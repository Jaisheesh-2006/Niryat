import { type Db, ensureTask, getInvoice, paymentLink, upsertDispute } from "@niryat/db";
import { getDispute, type PayPalLedger, type PayPalRestClient } from "@niryat/paypal";
import { disputeAlert, LOST_DISPUTE_OUTCOMES } from "@niryat/rules";
import { recordCapture } from "./payments";
import { indiaDate, rules } from "./rules";

export async function recordDispute(
  deps: { db: Db; rest: Pick<PayPalRestClient, "get">; ledger: Pick<PayPalLedger, "getCapture"> },
  disputeId: string,
): Promise<"recorded" | "not_found"> {
  const dispute = await getDispute(deps.rest, disputeId);
  if (!dispute) return "not_found";
  const captureId = dispute.captureIds[0] ?? null;
  let link = captureId ? await paymentLink(deps.db, captureId) : undefined;
  if (captureId && link === undefined) {
    await recordCapture(deps, captureId);
    link = await paymentLink(deps.db, captureId);
  }
  const invoiceId = link?.invoiceId ?? null;
  const responseDueDate = dispute.responseDue ? indiaDate(dispute.responseDue) : null;
  const applied = await upsertDispute(deps.db, {
    paypalDisputeId: dispute.disputeId,
    captureId,
    invoiceId,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    stage: dispute.stage,
    outcome: dispute.outcome,
    responseDueDate,
    paypalUpdatedAt: dispute.updateTime,
  });
  if (!applied) return "recorded";
  if (!link?.userId || !invoiceId) return "recorded";
  const invoice = await getInvoice(deps.db, link.userId, invoiceId);
  if (!invoice) return "recorded";
  const openAlert = disputeAlert(
    {
      invoiceNumber: invoice.number,
      paypalDisputeId: dispute.disputeId,
      amount: dispute.amount,
      currency: dispute.currency,
      responseDueDate,
      outcome: null,
    },
    rules,
  );
  await ensureTask(deps.db, {
    userId: link.userId,
    invoiceId,
    type: "dispute_opened",
    dueDate: responseDueDate,
    message: openAlert.message,
    sourceRuleId: "REALISATION_ADJUSTMENT",
    dedupeKey: `dispute:${dispute.disputeId}:opened`,
  });
  if (dispute.outcome && LOST_DISPUTE_OUTCOMES.includes(dispute.outcome)) {
    const lostAlert = disputeAlert(
      {
        invoiceNumber: invoice.number,
        paypalDisputeId: dispute.disputeId,
        amount: dispute.amount,
        currency: dispute.currency,
        responseDueDate: null,
        outcome: dispute.outcome,
      },
      rules,
    );
    await ensureTask(deps.db, {
      userId: link.userId,
      invoiceId,
      type: "dispute_lost",
      dueDate: null,
      message: lostAlert.message,
      sourceRuleId: "REALISATION_ADJUSTMENT",
      dedupeKey: `dispute:${dispute.disputeId}:lost`,
    });
  }
  return "recorded";
}
