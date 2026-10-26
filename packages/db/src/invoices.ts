import type { PayPalActionName } from "@niryat/agent";
import { type Invoice, type InvoiceInput, invoiceSchema } from "@niryat/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client";
import { agentActions, clients, invoices, payments } from "./schema";

async function readInvoices(
  db: Pick<Db, "select">,
  userId: string,
  invoiceId?: string,
): Promise<Invoice[]> {
  const rows = await db
    .select({
      invoice: invoices,
      clientName: clients.name,
      paidTotal: sql<string>`(select coalesce(sum(${payments.gross}), 0)::text
        from ${payments} where ${payments.invoiceId} = ${invoices.id}
        and ${payments.kind} = 'payment' and ${payments.currency} = ${invoices.currency})`,
    })
    .from(invoices)
    .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.userId, userId)))
    .where(and(eq(invoices.userId, userId), invoiceId ? eq(invoices.id, invoiceId) : undefined))
    .orderBy(desc(invoices.fy), desc(invoices.seq))
    .catch(() => {
      throw new Error("Invoice lookup failed");
    });
  if (!rows.length) return [];
  const ids = rows.map(({ invoice }) => invoice.id);
  const paymentRows = await db
    .select()
    .from(payments)
    .where(inArray(payments.invoiceId, ids))
    .catch(() => {
      throw new Error("Invoice lookup failed");
    });
  const actionRows = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.userId, userId), inArray(agentActions.invoiceId, ids)))
    .catch(() => {
      throw new Error("Invoice lookup failed");
    });
  return rows.map(({ invoice, clientName, paidTotal }) => {
    const action = actionRows.find((row) => row.invoiceId === invoice.id);
    const result = invoiceSchema.safeParse({
      ...invoice,
      clientName,
      paidTotal,
      payments: paymentRows
        .filter((row) => row.invoiceId === invoice.id && row.kind === "payment")
        .map((row) => ({ ...row, receivedAt: row.receivedAt?.toISOString() })),
      action: action ? { ...action, createdAt: action.createdAt?.toISOString() } : null,
    });
    if (!result.success) throw new Error("Stored invoice is invalid");
    return result.data;
  });
}

export async function issueInvoice(
  db: Db,
  userId: string,
  input: InvoiceInput & { date: string; fy: string },
  finalize: (draft: { id: string; seq: number; number: string }) => Promise<{
    pdfToken: string;
    pdfUrl: string;
    action: { paypalAction: PayPalActionName; payload: Record<string, unknown> };
  }>,
  numberFor: (seq: number) => string,
): Promise<Invoice> {
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.userId, userId)));
      if (!client) throw new Error("Invoice save failed");
      const [next] = await tx
        .select({ seq: sql<number>`coalesce(max(${invoices.seq}), 0) + 1` })
        .from(invoices)
        .where(and(eq(invoices.userId, userId), eq(invoices.fy, input.fy)));
      if (!next) throw new Error("Invoice save failed");
      const [draft] = await tx
        .insert(invoices)
        .values({
          userId,
          clientId: input.clientId,
          type: input.type,
          date: input.date,
          fy: input.fy,
          currency: input.currency,
          amount: input.amount,
          description: input.description,
          sac: input.sac,
          recurrence: input.recurrence,
          seq: next.seq,
          number: numberFor(next.seq),
          status: "issued",
        })
        .returning({ id: invoices.id, seq: invoices.seq, number: invoices.number });
      if (!draft) throw new Error("Invoice save failed");
      const { pdfToken, pdfUrl, action } = await finalize(draft);
      await tx
        .update(invoices)
        .set({ pdfToken, pdfUrl })
        .where(and(eq(invoices.id, draft.id), eq(invoices.userId, userId)));
      await tx.insert(agentActions).values({
        userId,
        invoiceId: draft.id,
        paypalAction: action.paypalAction,
        payload: action.payload,
        status: "proposed",
      });
      const [invoice] = await readInvoices(tx, userId, draft.id);
      if (!invoice) throw new Error("Invoice save failed");
      return invoice;
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "Stored invoice is invalid") {
        throw new Error("Stored invoice is invalid");
      }
      throw new Error("Invoice save failed");
    });
}

export async function listInvoices(db: Db, userId: string): Promise<Invoice[]> {
  return readInvoices(db, userId);
}

export async function getInvoiceForAction(
  db: Db,
  userId: string,
  actionId: string,
): Promise<Invoice | undefined> {
  const [action] = await db
    .select({ invoiceId: agentActions.invoiceId })
    .from(agentActions)
    .where(and(eq(agentActions.id, actionId), eq(agentActions.userId, userId)))
    .catch(() => {
      throw new Error("Invoice lookup failed");
    });
  if (!action?.invoiceId) return undefined;
  const [invoice] = await readInvoices(db, userId, action.invoiceId);
  return invoice;
}

export async function findPdfByToken(
  db: Db,
  token: string,
): Promise<{ userId: string; invoiceId: string; number: string } | undefined> {
  const [row] = await db
    .select({ userId: invoices.userId, invoiceId: invoices.id, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.pdfToken, token))
    .catch(() => {
      throw new Error("Invoice lookup failed");
    });
  return row;
}

export async function setPayPalInvoiceId(
  db: Db,
  userId: string,
  invoiceId: string,
  id: string,
): Promise<void> {
  await db
    .update(invoices)
    .set({ paypalInvoiceId: id })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .catch(() => {
      throw new Error("Invoice save failed");
    });
}

export async function setPayPalSeriesId(
  db: Db,
  userId: string,
  invoiceId: string,
  id: string,
): Promise<void> {
  await db
    .update(invoices)
    .set({ paypalRecurringSeriesId: id })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .catch(() => {
      throw new Error("Invoice save failed");
    });
}

export async function markSent(db: Db, userId: string, invoiceId: string): Promise<void> {
  await db
    .transaction(async (tx) => {
      const ownIssuedInvoice = and(
        eq(invoices.id, invoiceId),
        eq(invoices.userId, userId),
        eq(invoices.status, "issued"),
      );
      const [invoice] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(ownIssuedInvoice)
        .for("no key update");
      if (!invoice) return;
      // Read payments after acquiring the lock so a concurrent capture's commit is visible.
      const total = sql`(select coalesce(sum(${payments.gross}), 0) from ${payments}
        where ${payments.invoiceId} = ${invoices.id} and ${payments.kind} = 'payment'
        and ${payments.currency} = ${invoices.currency})`;
      await tx
        .update(invoices)
        .set({
          status: sql`case when ${total} >= ${invoices.amount} then 'paid'
            when ${total} > 0 then 'partially_paid' else 'sent' end`,
        })
        .where(ownIssuedInvoice);
    })
    .catch(() => {
      throw new Error("Invoice save failed");
    });
}
