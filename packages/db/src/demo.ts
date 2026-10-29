import type { StoredExportCheck } from "@niryat/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { clients, invoices, payments } from "./schema";

export async function insertDemoLedger(
  db: Db,
  userId: string,
  input: {
    client: { name: string; country: string; exportCheckResult: StoredExportCheck };
    items: {
      date: string;
      currency: string;
      amount: string;
      description: string;
      sac: string;
      paypalTxnId: string;
      receivedAt: Date;
    }[];
  },
  numberFor: (date: string, seq: number) => { fy: string; number: string },
): Promise<{ ok: true; invoices: number } | { ok: false; reason: "has_invoices" }> {
  return db
    .transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const [existing] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .limit(1);
      if (existing) return { ok: false, reason: "has_invoices" } as const;
      const [client] = await tx
        .insert(clients)
        .values({ userId, ...input.client })
        .returning({ id: clients.id });
      if (!client) throw new Error("Demo ledger save failed");
      for (const item of input.items) {
        const { fy } = numberFor(item.date, 1);
        const [next] = await tx
          .select({ seq: sql<number>`coalesce(max(${invoices.seq}), 0) + 1` })
          .from(invoices)
          .where(and(eq(invoices.userId, userId), eq(invoices.fy, fy)));
        if (!next) throw new Error("Demo ledger save failed");
        const [invoice] = await tx
          .insert(invoices)
          .values({
            userId,
            clientId: client.id,
            type: "one_time",
            ...numberFor(item.date, next.seq),
            seq: next.seq,
            date: item.date,
            currency: item.currency,
            amount: item.amount,
            description: item.description,
            sac: item.sac,
            status: "paid",
            pdfUrl: null,
          })
          .returning({ id: invoices.id });
        if (!invoice) throw new Error("Demo ledger save failed");
        await tx.insert(payments).values({
          invoiceId: invoice.id,
          paypalTxnId: item.paypalTxnId,
          kind: "payment",
          gross: item.amount,
          currency: item.currency,
          fee: null,
          net: null,
          receivedAt: item.receivedAt,
        });
      }
      return { ok: true, invoices: input.items.length } as const;
    })
    .catch(() => {
      throw new Error("Demo ledger save failed");
    });
}
