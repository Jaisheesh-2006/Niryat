import {
  type FiraDocument,
  type FiraLine,
  type FiraStatus,
  firaDocumentSchema,
} from "@niryat/shared";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { firaDocuments, firaLines, invoices, matches, payments } from "./schema";

export async function firaDocumentExists(db: Db, userId: string, sha256: string): Promise<boolean> {
  const [row] = await db
    .select({ id: firaDocuments.id })
    .from(firaDocuments)
    .where(and(eq(firaDocuments.userId, userId), eq(firaDocuments.sha256, sha256)))
    .limit(1)
    .catch(() => {
      throw new Error("FIRA lookup failed");
    });
  return row !== undefined;
}

export async function firaCandidates(db: Pick<Db, "select">, userId: string) {
  return db
    .select({
      paymentId: payments.id,
      paypalTxnId: payments.paypalTxnId,
      gross: payments.gross,
      net: payments.net,
      currency: payments.currency,
      receivedDate: sql<string>`(${payments.receivedAt} at time zone 'Asia/Kolkata')::date::text`,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .leftJoin(matches, eq(matches.paymentId, payments.id))
    .where(
      and(eq(invoices.userId, userId), eq(payments.kind, "payment"), isNull(matches.paymentId)),
    )
    .catch(() => {
      throw new Error("FIRA candidate lookup failed");
    });
}

export async function saveFiraDocument(
  db: Db,
  userId: string,
  doc: {
    id: string;
    sha256: string;
    fileKey: string;
    month: string;
    parsedAt: Date;
  },
  finalize: (candidates: Awaited<ReturnType<typeof firaCandidates>>) => Promise<
    (Pick<
      FiraLine,
      "position" | "date" | "amount" | "currency" | "reference" | "purposeCode" | "sourceText"
    > & {
      paymentId: string | null;
      confidence: string | null;
      note: string | null;
    })[]
  >,
): Promise<{ ok: true } | { ok: false; reason: "duplicate" }> {
  return db
    .transaction(async (tx) => {
      // Keep duplicate checks, candidate selection and file writes in the same user lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const [document] = await tx
        .insert(firaDocuments)
        .values({
          id: doc.id,
          userId,
          sha256: doc.sha256,
          fileUrl: doc.fileKey,
          month: doc.month,
          parsedAt: doc.parsedAt,
        })
        .onConflictDoNothing({ target: [firaDocuments.userId, firaDocuments.sha256] })
        .returning();
      if (!document) return { ok: false, reason: "duplicate" } as const;
      const lines = await finalize(await firaCandidates(tx, userId));
      for (const { paymentId, confidence, ...line } of lines) {
        const [saved] = await tx
          .insert(firaLines)
          .values({ ...line, firaDocumentId: doc.id })
          .returning();
        if (!saved) throw new Error("FIRA save failed");
        if (paymentId !== null && confidence !== null) {
          await tx.insert(matches).values({ firaLineId: saved.id, paymentId, confidence });
        }
      }
      return { ok: true } as const;
    })
    .catch(() => {
      throw new Error("FIRA save failed");
    });
}

export async function listFiraDocuments(
  db: Pick<Db, "select">,
  userId: string,
): Promise<FiraDocument[]> {
  const documents = await db
    .select()
    .from(firaDocuments)
    .where(eq(firaDocuments.userId, userId))
    .orderBy(desc(firaDocuments.createdAt), desc(firaDocuments.id))
    .catch(() => {
      throw new Error("FIRA lookup failed");
    });
  const lines = await db
    .select({
      line: firaLines,
      match: {
        paymentId: matches.paymentId,
        confidence: matches.confidence,
        state: sql<
          "matched" | "needs_confirmation"
        >`case when ${matches.confidence} >= 0.90 or ${matches.confirmedByUser} then 'matched' else 'needs_confirmation' end`,
      },
      paypalTxnId: payments.paypalTxnId,
      invoiceId: invoices.id,
      invoiceNumber: invoices.number,
    })
    .from(firaLines)
    .innerJoin(firaDocuments, eq(firaDocuments.id, firaLines.firaDocumentId))
    .leftJoin(matches, eq(matches.firaLineId, firaLines.id))
    .leftJoin(payments, eq(payments.id, matches.paymentId))
    .leftJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.userId, userId)))
    .where(eq(firaDocuments.userId, userId))
    .orderBy(firaLines.position)
    .catch(() => {
      throw new Error("FIRA lookup failed");
    });
  return documents.map((document) => {
    const result = firaDocumentSchema.safeParse({
      id: document.id,
      month: document.month,
      uploadedAt: document.createdAt?.toISOString(),
      lines: lines
        .filter(({ line }) => line.firaDocumentId === document.id)
        .map((row) => ({
          ...row.line,
          match: row.match?.paymentId
            ? {
                ...row.match,
                paypalTxnId: row.paypalTxnId,
                invoiceId: row.invoiceId,
                invoiceNumber: row.invoiceNumber,
              }
            : null,
        })),
    });
    if (!result.success) throw new Error("Stored FIRA is invalid");
    return result.data;
  });
}

export async function decideFiraMatch(
  db: Db,
  userId: string,
  lineId: string,
  decision: "confirm" | "reject",
): Promise<
  { ok: true; document: FiraDocument } | { ok: false; reason: "not_found" | "no_suggestion" }
> {
  return db
    .transaction(async (tx) => {
      const [line] = await tx
        .select({ documentId: firaLines.firaDocumentId })
        .from(firaLines)
        .innerJoin(firaDocuments, eq(firaDocuments.id, firaLines.firaDocumentId))
        .where(and(eq(firaLines.id, lineId), eq(firaDocuments.userId, userId)))
        .for("update", { of: firaLines });
      if (!line) return { ok: false, reason: "not_found" } as const;
      const suggestion = and(
        eq(matches.firaLineId, lineId),
        isNull(matches.confirmedByUser),
        lt(matches.confidence, "0.90"),
      );
      const changed =
        decision === "confirm"
          ? await tx.update(matches).set({ confirmedByUser: true }).where(suggestion).returning()
          : await tx.delete(matches).where(suggestion).returning();
      if (!changed.length) return { ok: false, reason: "no_suggestion" } as const;
      if (decision === "reject") {
        await tx
          .update(firaLines)
          .set({ note: "You rejected the suggested match." })
          .where(eq(firaLines.id, lineId));
      }
      const document = (await listFiraDocuments(tx, userId)).find(
        (doc) => doc.id === line.documentId,
      );
      if (!document) throw new Error("FIRA lookup failed");
      return { ok: true, document } as const;
    })
    .catch(() => {
      throw new Error("FIRA decision failed");
    });
}

export function firaStatusFor(
  payments: readonly {
    fira: { state: "matched" | "needs_confirmation" } | null;
    receivedMonth: string;
  }[],
  coveredMonths: ReadonlySet<string>,
): FiraStatus {
  if (payments.length > 0 && payments.every((payment) => payment.fira?.state === "matched"))
    return "matched";
  if (payments.some((payment) => payment.fira === null && coveredMonths.has(payment.receivedMonth)))
    return "missing";
  return "pending";
}
