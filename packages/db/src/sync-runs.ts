import { type SyncStatus, syncStatusSchema } from "@niryat/shared";
import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./client";
import { syncRuns } from "./schema";

export async function startSyncRun(db: Db, now: Date): Promise<string | undefined> {
  // shortcut: a killed poll leaves a running row; confirm it stopped before failing that row to retry.
  const [row] = await db
    .insert(syncRuns)
    .values({ status: "running", startedAt: now })
    .onConflictDoNothing()
    .returning({ id: syncRuns.id })
    .catch(() => {
      throw new Error("Sync run save failed");
    });
  return row?.id;
}

export async function finishSyncRun(
  db: Db,
  runId: string,
  status: "ok" | "failed",
  summary: unknown,
  now: Date,
): Promise<void> {
  const parsed = z
    .object({
      runId: z.uuid(),
      status: z.enum(["ok", "failed"]),
      summary: z.record(z.string(), z.record(z.string(), z.int().nonnegative())),
    })
    .safeParse({ runId, status, summary });
  if (!parsed.success) throw new Error("Sync run result is invalid");
  await db
    .update(syncRuns)
    .set({ status: parsed.data.status, summary: parsed.data.summary, finishedAt: now })
    .where(and(eq(syncRuns.id, parsed.data.runId), eq(syncRuns.status, "running")))
    .catch(() => {
      throw new Error("Sync run save failed");
    });
}

export async function readSyncStatus(db: Db, now: Date): Promise<SyncStatus> {
  const rows = await db
    .transaction(
      async (tx) => {
        const [latest] = await tx
          .select({ status: syncRuns.status })
          .from(syncRuns)
          .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
          .limit(1);
        const [success] = await tx
          .select({ at: max(syncRuns.finishedAt) })
          .from(syncRuns)
          .where(eq(syncRuns.status, "ok"));
        return { latest, success };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    )
    .catch(() => {
      throw new Error("Sync status lookup failed");
    });
  const lastSuccessAt =
    z
      .date()
      .nullable()
      .parse(rows.success?.at ?? null)
      ?.toISOString() ?? null;
  return syncStatusSchema.parse({
    lastSuccessAt,
    lastStatus: rows.latest?.status ?? null,
    stale: !lastSuccessAt || now.getTime() - new Date(lastSuccessAt).getTime() >= 2 * 60 * 60_000,
  });
}
