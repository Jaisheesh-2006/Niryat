import type { ActionStore } from "@niryat/agent";
import {
  actionSchema,
  invoiceInputSchema,
  type ReminderAction,
  reminderActionSchema,
} from "@niryat/shared";
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./client";
import { agentActions, invoices, payments } from "./schema";

export async function proposeReminder(
  db: Db,
  userId: string,
  input: { invoiceId: string; dedupeKey: string; payload: Record<string, unknown> },
): Promise<{ ok: true; actionId: string } | { ok: false; reason: "exists" | "not_found" }> {
  const payload = z.record(z.string(), z.json()).safeParse(input.payload);
  if (!payload.success) throw new Error("Reminder payload is invalid");
  return db
    .transaction(async (tx) => {
      const [invoice] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.userId, userId)));
      if (!invoice) return { ok: false, reason: "not_found" } as const;
      const [row] = await tx
        .insert(agentActions)
        .values({
          userId,
          invoiceId: invoice.id,
          paypalAction: "send_invoice_reminder",
          status: "proposed",
          dedupeKey: input.dedupeKey,
          payload: payload.data,
        })
        .onConflictDoNothing({ target: agentActions.dedupeKey })
        .returning({ id: agentActions.id });
      return row
        ? ({ ok: true, actionId: row.id } as const)
        : ({ ok: false, reason: "exists" } as const);
    })
    .catch(() => {
      throw new Error("Reminder proposal save failed");
    });
}

export async function reminderKeys(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ key: agentActions.dedupeKey })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.userId, userId),
        eq(agentActions.paypalAction, "send_invoice_reminder"),
        isNotNull(agentActions.dedupeKey),
      ),
    )
    .catch(() => {
      throw new Error("Reminder lookup failed");
    });
  const result = z.array(z.object({ key: z.string() })).safeParse(rows);
  if (!result.success) throw new Error("Stored reminder key is invalid");
  return new Set(result.data.map((row) => row.key));
}

export async function listReminderActions(
  db: Db,
  userId: string,
  limit: number,
): Promise<ReminderAction[]> {
  const rows = await db
    .select({ action: agentActions, invoiceNumber: invoices.number })
    .from(agentActions)
    .innerJoin(invoices, and(eq(invoices.id, agentActions.invoiceId), eq(invoices.userId, userId)))
    .where(
      and(eq(agentActions.userId, userId), eq(agentActions.paypalAction, "send_invoice_reminder")),
    )
    .orderBy(desc(agentActions.createdAt), desc(agentActions.id))
    .limit(limit)
    .catch(() => {
      throw new Error("Reminder lookup failed");
    });
  return rows.map(({ action, invoiceNumber }) => {
    const result = reminderActionSchema.safeParse({
      ...action,
      invoiceNumber,
      createdAt: action.createdAt?.toISOString(),
    });
    if (!result.success) throw new Error("Stored reminder is invalid");
    return result.data;
  });
}

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
            or(
              eq(agentActions.status, "proposed"),
              and(
                eq(agentActions.status, "failed"),
                ne(agentActions.paypalAction, "send_invoice_reminder"),
              ),
            ),
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
        or(
          ne(agentActions.paypalAction, "send_invoice_reminder"),
          ne(agentActions.status, "failed"),
          sql`${agentActions.error} is distinct from 'reminder_outcome_unknown'`,
        ),
      ),
    )
    .returning({ id: agentActions.id })
    .catch(() => {
      throw new Error("Action save failed");
    });
  return rows.length > 0;
}
