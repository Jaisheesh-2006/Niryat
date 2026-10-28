import { z } from "zod";
import { PayPalApiError, type PayPalRestClient, type PayPalRestPath } from "./index";

export interface DisputeRecord {
  disputeId: string;
  captureIds: string[];
  amount: string;
  currency: string;
  reason: string;
  status: string;
  stage: string | null;
  outcome: string | null;
  responseDue: string | null;
  updateTime: string;
}

const disputeIdSchema = z.string().regex(/^PP-[A-Z0-9-]+$/);
const instantSchema = z.iso.datetime({ offset: true });
const disputeSchema = z.object({
  dispute_id: disputeIdSchema,
  disputed_transactions: z.array(z.object({ seller_transaction_id: z.string().min(1) })),
  dispute_amount: z.object({
    value: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency_code: z.string().regex(/^[A-Z]{3}$/),
  }),
  reason: z.string().min(1),
  status: z.string().min(1),
  dispute_life_cycle_stage: z.string().min(1).optional(),
  dispute_outcome: z.object({ outcome_code: z.string().min(1) }).optional(),
  seller_response_due_date: instantSchema.optional(),
  update_time: instantSchema,
});
const disputeListSchema = z.object({
  items: z.array(z.object({ dispute_id: disputeIdSchema })).default([]),
  links: z.array(z.object({ rel: z.string().min(1), href: z.url() })).optional(),
});

export function toDisputeRecord(input: unknown): DisputeRecord {
  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid dispute");
  const dispute = parsed.data;
  return {
    disputeId: dispute.dispute_id,
    captureIds: dispute.disputed_transactions.map(
      (transaction) => transaction.seller_transaction_id,
    ),
    amount: dispute.dispute_amount.value,
    currency: dispute.dispute_amount.currency_code,
    reason: dispute.reason,
    status: dispute.status,
    stage: dispute.dispute_life_cycle_stage ?? null,
    outcome: dispute.dispute_outcome?.outcome_code ?? null,
    responseDue: dispute.seller_response_due_date ?? null,
    updateTime: dispute.update_time,
  };
}

export async function getDispute(
  rest: Pick<PayPalRestClient, "get">,
  disputeId: string,
): Promise<DisputeRecord | null> {
  if (!disputeIdSchema.safeParse(disputeId).success) throw new Error("Invalid disputeId");
  try {
    return await rest.get(`/v1/customer/disputes/${disputeId}`, toDisputeRecord);
  } catch (error) {
    if (error instanceof PayPalApiError && error.status === 404) return null;
    throw error;
  }
}

export async function listUpdatedDisputeIds(
  rest: Pick<PayPalRestClient, "get">,
  updatedAfter: string,
): Promise<string[]> {
  if (!instantSchema.safeParse(updatedAfter).success) throw new Error("Invalid updatedAfter");
  let path: PayPalRestPath = `/v1/customer/disputes?update_time_after=${encodeURIComponent(updatedAfter)}&page_size=50`;
  const ids: string[] = [];
  for (let page = 0; page < 20; page++) {
    const result = await rest.get(path, (input) => {
      const parsed = disputeListSchema.safeParse(input);
      if (!parsed.success) throw new Error("Invalid dispute list");
      return parsed.data;
    });
    ids.push(...result.items.map((item) => item.dispute_id));
    const next = result.links?.find((link) => link.rel === "next");
    if (!next) return ids;
    const url = new URL(next.href);
    if (
      url.origin !== "https://api-m.sandbox.paypal.com" ||
      url.pathname !== "/v1/customer/disputes" ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("Invalid dispute pagination link");
    }
    path = `/v1/customer/disputes${url.search}`;
  }
  throw new Error("Too many dispute pages");
}
