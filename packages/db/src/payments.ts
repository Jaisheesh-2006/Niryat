import type { CaptureRecord } from "@niryat/paypal";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "./client";
import { invoices, payments } from "./schema";

// A default export keeps this helper out of index.ts's wildcard exports.
export default async function rollUpInvoice(
  tx: Pick<Db, "select" | "update">,
  invoiceId: string,
): Promise<void> {
  // Serialize roll-ups without conflicting with payment inserts' foreign-key locks.
  await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .for("no key update");
  const paid = sql`(select coalesce(sum(${payments.gross}), 0) from ${payments}
    where ${payments.invoiceId} = ${invoices.id} and ${payments.kind} = 'payment'
    and ${payments.currency} = ${invoices.currency})`;
  const refunded = sql`(select coalesce(sum(${payments.gross}), 0) from ${payments}
    where ${payments.invoiceId} = ${invoices.id} and ${payments.kind} = 'refund'
    and ${payments.currency} = ${invoices.currency})`;
  await tx
    .update(invoices)
    .set({
      status: sql`case when ${refunded} > 0 and ${refunded} >= ${paid} then 'refunded'
        when ${refunded} > 0 then 'partially_refunded'
        when ${paid} >= ${invoices.amount} then 'paid'
        when ${paid} > 0 then 'partially_paid' else ${invoices.status} end`,
    })
    .where(
      and(
        eq(invoices.id, invoiceId),
        inArray(invoices.status, [
          "sent",
          "partially_paid",
          "paid",
          "partially_refunded",
          "refunded",
        ]),
      ),
    );
}

export async function recordPayment(
  db: Db,
  capture: CaptureRecord,
): Promise<{ invoiceId: string | null }> {
  return db
    .transaction(async (tx) => {
      const [invoice] = capture.paypalInvoiceId
        ? await tx
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              or(
                eq(invoices.paypalInvoiceId, capture.paypalInvoiceId),
                eq(invoices.paypalRecurringSeriesId, capture.paypalInvoiceId),
              ),
            )
        : [];
      const values = {
        invoiceId: invoice?.id ?? null,
        paypalTxnId: capture.captureId,
        kind: "payment",
        gross: capture.gross,
        fee: capture.fee,
        net: capture.net,
        currency: capture.currency,
        fxRate: capture.fxRate,
        receivedAt: new Date(capture.createTime),
      };
      const [saved] = await tx
        .insert(payments)
        .values(values)
        .onConflictDoUpdate({
          target: payments.paypalTxnId,
          set: { ...values, invoiceId: sql`coalesce(${payments.invoiceId}, excluded.invoice_id)` },
        })
        .returning({ invoiceId: payments.invoiceId });
      if (!saved) throw new Error("Payment save failed");
      if (saved.invoiceId) {
        await rollUpInvoice(tx, saved.invoiceId);
      }
      return saved;
    })
    .catch(() => {
      throw new Error("Payment save failed");
    });
}

export async function knownTransactionIds(db: Db, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: payments.paypalTxnId })
    .from(payments)
    .where(inArray(payments.paypalTxnId, [...ids]))
    .catch(() => {
      throw new Error("Payment lookup failed");
    });
  return new Set(rows.map((row) => row.id));
}
