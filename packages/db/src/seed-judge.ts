import { randomUUID } from "node:crypto";
import { JUDGE_EMAILS, type ProfileInput, sessionUserSchema, type UserRole } from "@niryat/shared";
import { eq, sql } from "drizzle-orm";
import { claimCaRequest, createCaLink, respondToCaRequest } from "./ca-links";
import type { Db } from "./client";
import { updateClient } from "./clients";
import { insertDemoLedger } from "./demo";
import { saveFiraDocument } from "./fira";
import rollUpInvoice from "./payments";
import { getProfile, upsertProfile } from "./profiles";
import { clients, disputes, invoices, payments, users } from "./schema";
import { createUser } from "./users";

export async function findJudgeUser(db: Db, role: UserRole) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, JUDGE_EMAILS[role]))
    .catch(() => {
      throw new Error("Judge account lookup failed");
    });
  if (!row || row.role !== role || row.passwordHash !== null || row.paypalPayerId !== null)
    return undefined;
  const parsed = sessionUserSchema.safeParse(row);
  if (!parsed.success) throw new Error("Stored judge account is invalid");
  return parsed.data;
}

export async function seedJudgeRecords(
  db: Db,
  key: Buffer,
  input: {
    now: Date;
    buyerEmail: string;
    accounts: readonly {
      email: string;
      profile: ProfileInput;
      ledger: Parameters<typeof insertDemoLedger>[2];
      unpaidDate: string | null;
    }[];
  },
  numberFor: Parameters<typeof insertDemoLedger>[3],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('niryat:judge-seed'))`);
    async function account(email: string, role: UserRole) {
      await createUser(tx, { email, role });
      const [row] = await tx.select().from(users).where(eq(users.email, email));
      if (!row || row.role !== role || row.passwordHash !== null || row.paypalPayerId !== null) {
        throw new Error("Judge account collision; no records changed");
      }
      return row.id;
    }
    const caId = await account(JUDGE_EMAILS.ca, "ca");
    for (const fixture of input.accounts) {
      const userId = await account(fixture.email, "freelancer");
      // Reruns preserve judge edits, including ended sharing and newly issued invoices.
      if (await getProfile(tx, userId, key)) continue;
      const seeded = await insertDemoLedger(tx, userId, fixture.ledger, numberFor);
      if (!seeded.ok) throw new Error("Judge account already has invoices");
      await upsertProfile(tx, userId, fixture.profile, key);
      const [client] = await tx.select().from(clients).where(eq(clients.userId, userId));
      if (!client) throw new Error("Judge client missing");
      await updateClient(tx, userId, key, client.id, {
        name: client.name,
        country: client.country,
        email: input.buyerEmail,
        address: "Synthetic demo address, New York, US",
        exportCheck: fixture.ledger.client.exportCheckResult,
      });
      const paid = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(invoices.date, invoices.seq);
      for (const invoice of paid) {
        await tx
          .update(payments)
          .set({ fee: "30.00", net: "970.00" })
          .where(eq(payments.invoiceId, invoice.id));
      }
      if (fixture.unpaidDate) {
        const fy = numberFor(fixture.unpaidDate, 1).fy;
        const seq = paid.filter((invoice) => invoice.fy === fy).length + 1;
        await tx.insert(invoices).values({
          userId,
          clientId: client.id,
          type: "one_time",
          seq,
          ...numberFor(fixture.unpaidDate, seq),
          date: fixture.unpaidDate,
          currency: "USD",
          amount: "500.00",
          description: "Synthetic unpaid demo invoice",
          sac: "998314",
          status: "sent",
          paypalInvoiceId: null,
        });
      }
      if (fixture.email === JUDGE_EMAILS.freelancer) {
        const first = paid[0];
        const refunded = paid.at(-1);
        if (!first || !refunded) throw new Error("Judge history missing");
        await tx.insert(payments).values({
          invoiceId: refunded.id,
          paypalTxnId: "JUDGE-SYNTHETIC-REFUND",
          kind: "refund",
          gross: "100.00",
          fee: "0.00",
          net: "100.00",
          currency: "USD",
          receivedAt: input.now,
        });
        await rollUpInvoice(tx, refunded.id);
        await tx.insert(disputes).values({
          invoiceId: first.id,
          paypalDisputeId: "JUDGE-SYNTHETIC-DISPUTE",
          amount: "1000.00",
          currency: "USD",
          reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
          status: "OPEN",
          stage: "INQUIRY",
          responseDueDate: refunded.date,
          paypalUpdatedAt: input.now,
        });
        const fira = await saveFiraDocument(
          tx,
          userId,
          {
            id: randomUUID(),
            month: `${first.date.slice(0, 7)}-01`,
            fileKey: "judge/synthetic-sample",
            sha256: "judge-synthetic-sample",
            parsedAt: input.now,
          },
          async (candidates) =>
            candidates.map((payment, index) => ({
              position: index + 1,
              date: payment.receivedDate,
              amount: payment.gross,
              currency: payment.currency,
              reference: payment.paypalTxnId,
              purposeCode: "P1006",
              sourceText: "Synthetic FIRA sample - not a bank document",
              paymentId: payment.paymentId,
              confidence: "1.00",
              note: null,
            })),
        );
        if (!fira.ok) throw new Error("Judge FIRA already exists");
      }
      const link = await createCaLink(tx, userId, JUDGE_EMAILS.ca);
      if (
        !link.ok ||
        !(await claimCaRequest(tx, caId, link.invitationCode)) ||
        !(await respondToCaRequest(tx, caId, link.link.id, "accept", input.now))
      ) {
        throw new Error("Judge invitation failed");
      }
    }
  });
}
