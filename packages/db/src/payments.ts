import type { CaptureRecord, RefundRecord } from "@niryat/paypal";
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

export async function paymentLink(
  db: Pick<Db, "select">,
  captureId: string,
): Promise<{ invoiceId: string | null; userId: string | null } | undefined> {
  const [row] = await db
    .select({ invoiceId: payments.invoiceId, userId: invoices.userId })
    .from(payments)
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.paypalTxnId, captureId), eq(payments.kind, "payment")))
    .catch(() => {
      throw new Error("Payment lookup failed");
    });
  return row;
}

export async function recordRefund(
  db: Db,
  refund: RefundRecord,
): Promise<{ invoiceId: string | null; userId: string | null }> {
  return db
    .transaction(async (tx) => {
      const payment = refund.captureId ? await paymentLink(tx, refund.captureId) : undefined;
      const [invoice] =
        !payment?.invoiceId && refund.paypalInvoiceId
          ? await tx
              .select({ id: invoices.id })
              .from(invoices)
              .where(eq(invoices.paypalInvoiceId, refund.paypalInvoiceId))
          : [];
      const values = {
        invoiceId: payment?.invoiceId ?? invoice?.id ?? null,
        paypalTxnId: refund.refundId,
        captureId: refund.captureId,
        kind: "refund",
        gross: refund.gross,
        fee: refund.fee,
        net: refund.net,
        currency: refund.currency,
        receivedAt: new Date(refund.createTime),
      };
      const [saved] = await tx
        .insert(payments)
        .values(values)
        .onConflictDoUpdate({
          target: payments.paypalTxnId,
          set: {
            ...values,
            invoiceId: sql`coalesce(${payments.invoiceId}, excluded.invoice_id)`,
            captureId: sql`coalesce(${payments.captureId}, excluded.capture_id)`,
          },
        })
        .returning({ invoiceId: payments.invoiceId });
      if (!saved) throw new Error("Refund save failed");
      if (!saved.invoiceId) return { invoiceId: null, userId: null };
      await rollUpInvoice(tx, saved.invoiceId);
      const [owner] = await tx
        .select({ userId: invoices.userId })
        .from(invoices)
        .where(eq(invoices.id, saved.invoiceId));
      if (!owner) throw new Error("Refund save failed");
      return { ...saved, userId: owner.userId };
    })
    .catch(() => {
      throw new Error("Refund save failed");
    });
}
