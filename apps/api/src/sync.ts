import { resolve } from "node:path";
import { createDb, type Db, knownTransactionIds } from "@niryat/db";
import {
  createPayPalLedger,
  createPayPalRestClient,
  listUpdatedDisputeIds,
  type PayPalLedger,
  type PayPalRestClient,
} from "@niryat/paypal";
import { recordDispute } from "./disputes";
import { loadAuthEnv, loadEnv, loadPayPalEnv } from "./env";
import { recordCapture } from "./payments";

export async function syncPayments(deps: { db: Db; ledger: PayPalLedger }, now: Date) {
  const rows = (
    await deps.ledger.searchTransactions({
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: now.toISOString(),
    })
  ).filter((row) => row.eventCode.startsWith("T00"));
  // shortcut: refunds missed by webhooks are not reconciled; add T11xx rows to the sync if one is ever missed.
  const known = await knownTransactionIds(
    deps.db,
    rows.map((row) => row.transactionId),
  );
  const summary = { seen: rows.length, alreadyRecorded: 0, recorded: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    if (known.has(row.transactionId)) {
      summary.alreadyRecorded++;
      continue;
    }
    try {
      if ((await recordCapture(deps, row.transactionId)) === "recorded") {
        summary.recorded++;
        known.add(row.transactionId);
      } else {
        summary.skipped++;
      }
    } catch {
      summary.failed++;
    }
  }
  return summary;
}

export async function syncDisputes(
  deps: { db: Db; rest: Pick<PayPalRestClient, "get">; ledger: Pick<PayPalLedger, "getCapture"> },
  now: Date,
) {
  const ids = await listUpdatedDisputeIds(
    deps.rest,
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
  const summary = { seen: ids.length, recorded: 0, notFound: 0, failed: 0 };
  for (const disputeId of ids) {
    try {
      const outcome = await recordDispute(deps, disputeId);
      summary[outcome === "not_found" ? "notFound" : "recorded"]++;
    } catch {
      summary.failed++;
    }
  }
  return summary;
}

export async function main() {
  try {
    try {
      process.loadEnvFile(resolve("../../.env"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    let authEnv: ReturnType<typeof loadAuthEnv>;
    let paypalEnv: ReturnType<typeof loadPayPalEnv>;
    try {
      loadEnv(process.env);
      authEnv = loadAuthEnv(process.env);
      paypalEnv = loadPayPalEnv(process.env);
      if (!authEnv) throw new Error("Invalid environment: DATABASE_URL. See .env.example.");
      if (!paypalEnv) {
        throw new Error(
          "Invalid environment: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID. See .env.example.",
        );
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Invalid environment");
      process.exitCode = 1;
      return;
    }
    const database = createDb(authEnv.DATABASE_URL);
    try {
      const ledger = createPayPalLedger({
        clientId: paypalEnv.PAYPAL_CLIENT_ID,
        clientSecret: paypalEnv.PAYPAL_CLIENT_SECRET,
      });
      const rest = createPayPalRestClient({
        clientId: paypalEnv.PAYPAL_CLIENT_ID,
        clientSecret: paypalEnv.PAYPAL_CLIENT_SECRET,
      });
      const now = new Date();
      const payments = await syncPayments({ db: database.db, ledger }, now);
      const disputes = await syncDisputes({ db: database.db, rest, ledger }, now);
      const summary = { payments, disputes };
      console.log(JSON.stringify(summary));
      if (payments.failed > 0 || disputes.failed > 0) process.exitCode = 1;
    } finally {
      await database.close();
    }
  } catch {
    console.error("Payment sync failed");
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
