import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { disputes } from "./schema";

export async function upsertDispute(
  db: Db,
  row: {
    paypalDisputeId: string;
    captureId: string | null;
    invoiceId: string | null;
    amount: string;
    currency: string;
    reason: string;
    status: string;
    stage: string | null;
    outcome: string | null;
    responseDueDate: string | null;
    paypalUpdatedAt: string;
  },
): Promise<void> {
  const values = { ...row, paypalUpdatedAt: new Date(row.paypalUpdatedAt) };
  await db
    .insert(disputes)
    .values(values)
    .onConflictDoUpdate({
      target: disputes.paypalDisputeId,
      set: { ...values, invoiceId: sql`coalesce(${disputes.invoiceId}, excluded.invoice_id)` },
      setWhere: sql`${disputes.paypalUpdatedAt} <= excluded.paypal_updated_at`,
    })
    .catch(() => {
      throw new Error("Dispute save failed");
    });
}
