import type { ActionStore } from "@niryat/agent";
import { actionSchema, invoiceInputSchema } from "@niryat/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./client";
import { agentActions, invoices, payments } from "./schema";

export async function proposeRefund(
  db: Db,
  userId: string,
  paymentId: string,
  amount: string,
  payloadFor: (p: {
    invoiceId: string;
    invoiceNumber: string;
    captureId: string;
    currency: string;
  }) => Record<string, unknown>,
): Promise<
  | { ok: true; invoiceId: string }
  | { ok: false; reason: "not_found" | "refund_pending" | "refund_exceeds_payment" }
> {
  return db
    .transaction(async (tx) => {
      const [row] = await tx
        .select({
          invoiceId: invoices.id,
          invoiceNumber: invoices.number,
          captureId: payments.paypalTxnId,
          currency: payments.currency,
        })
        .from(payments)
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.kind, "payment"),
            eq(invoices.userId, userId),
          ),
        )
        .for("update", { of: payments });
      if (!row) return { ok: false, reason: "not_found" } as const;
      const payment = z
        .strictObject({
          invoiceId: z.uuid(),
          invoiceNumber: z.string().min(1),
          captureId: z.string().min(1),
          currency: invoiceInputSchema.shape.currency,
        })
        .safeParse(row);
      if (!payment.success) throw new Error("Stored payment is invalid");
      const [pending] = await tx
        .select({ id: agentActions.id })
        .from(agentActions)
        .where(
          and(
            eq(agentActions.paymentId, paymentId),
            inArray(agentActions.status, ["proposed", "approved", "failed"]),
          ),
        );
      if (pending) return { ok: false, reason: "refund_pending" } as const;
      // Explicit table qualifiers keep the subquery correlated when Drizzle omits column qualifiers.
      const [balance] = await tx
        .select({
          exceeds: sql<boolean>`${amount}::numeric > ${payments.gross} - (
        select coalesce(sum(refund.gross), 0) from ${payments} as refund
        where refund.kind = 'refund' and refund.capture_id = ${payments}.paypal_txn_id
        and refund.currency = ${payments}.currency)`,
        })
        .from(payments)
        .where(eq(payments.id, paymentId));
      const parsed = z.object({ exceeds: z.boolean() }).safeParse(balance);
      if (!parsed.success) throw new Error("Stored payment balance is invalid");
      if (parsed.data.exceeds) return { ok: false, reason: "refund_exceeds_payment" } as const;
      await tx.insert(agentActions).values({
        userId,
        invoiceId: payment.data.invoiceId,
        paymentId,
        paypalAction: "refund_payment",
        status: "proposed",
        payload: payloadFor(payment.data),
      });
      return { ok: true, invoiceId: payment.data.invoiceId } as const;
    })
    .catch(() => {
      throw new Error("Refund proposal save failed");
    });
}

export function actionStore(db: Db): ActionStore {
  return {
    async claim(actionId, userId) {
      const [row] = await db
        .update(agentActions)
        .set({ status: "approved", updatedAt: sql`now()` })
        .where(
          and(
            eq(agentActions.id, actionId),
            eq(agentActions.userId, userId),
            inArray(agentActions.status, ["proposed", "failed"]),
          ),
        )
        .returning()
        .catch(() => {
          throw new Error("Action save failed");
        });
      if (!row) return undefined;
      const result = actionSchema.safeParse({ ...row, createdAt: row.createdAt?.toISOString() });
      if (!result.success) throw new Error("Stored action is invalid");
      return { ...result.data, userId: row.userId };
    },
    async finish(actionId, outcome) {
      await db
        .update(agentActions)
        .set({
          status: outcome.status,
          error: outcome.status === "done" ? null : outcome.error,
          updatedAt: sql`now()`,
        })
        .where(and(eq(agentActions.id, actionId), eq(agentActions.status, "approved")))
        .catch(() => {
          throw new Error("Action save failed");
        });
    },
  };
}

export async function rejectAction(db: Db, userId: string, actionId: string): Promise<boolean> {
  const rows = await db
    .update(agentActions)
    .set({ status: "rejected", updatedAt: sql`now()` })
    .where(
      and(
        eq(agentActions.id, actionId),
        eq(agentActions.userId, userId),
        inArray(agentActions.status, ["proposed", "failed"]),
      ),
    )
    .returning({ id: agentActions.id })
    .catch(() => {
      throw new Error("Action save failed");
    });
  return rows.length > 0;
}
