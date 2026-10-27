import { type Db, recordPayment } from "@niryat/db";
import type { PayPalLedger } from "@niryat/paypal";

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
