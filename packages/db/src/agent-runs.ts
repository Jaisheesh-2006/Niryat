import {
  type AgentRun,
  type AgentRunKind,
  type AgentRunTrigger,
  type AiStatus,
  agentRunSchema,
  aiStatuses,
  type CloseSummary,
  closeSummarySchema,
  currencyTotalSchema,
  toolCallSchema,
} from "@niryat/shared";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./client";
import {
  agentRuns,
  agentToolCalls,
  disputes,
  firaDocuments,
  firaLines,
  invoices,
  matches,
  payments,
} from "./schema";

const STALE_RUN_MINUTES = 15;

export async function startAgentRun(
  db: Db,
  run: {
    userId: string;
    kind: AgentRunKind;
    trigger: AgentRunTrigger;
    month: string;
    asOf: string;
  },
  now: Date,
): Promise<{ ok: true; runId: string } | { ok: false; reason: "running" }> {
  const parsed = agentRunSchema
    .pick({ kind: true, trigger: true, month: true, asOf: true })
    .extend({ userId: z.uuid() })
    .safeParse(run);
  if (!parsed.success) throw new Error("Agent run input is invalid");
  return db
    .transaction(async (tx) => {
      await tx
        .update(agentRuns)
        .set({ status: "failed", error: "stale", finishedAt: now })
        .where(
          and(
            eq(agentRuns.userId, run.userId),
            eq(agentRuns.kind, run.kind),
            eq(agentRuns.status, "running"),
            lt(agentRuns.startedAt, new Date(now.getTime() - STALE_RUN_MINUTES * 60_000)),
          ),
        );
      const [row] = await tx
        .insert(agentRuns)
        .values({ ...parsed.data, status: "running", startedAt: now })
        .onConflictDoNothing({
          target: [agentRuns.userId, agentRuns.kind],
          where: sql`${agentRuns.status} = 'running'`,
        })
        .returning({ id: agentRuns.id });
      return row
        ? ({ ok: true, runId: row.id } as const)
        : ({ ok: false, reason: "running" } as const);
    })
    .catch(() => {
      throw new Error("Agent run save failed");
    });
}

export async function logToolCall(
  db: Db,
  runId: string,
  call: { actor: "agent" | "system"; tool: string; input: unknown; output: unknown; ok: boolean },
): Promise<void> {
  const parsed = toolCallSchema.omit({ seq: true, createdAt: true }).safeParse(call);
  if (!parsed.success) throw new Error("Tool call input is invalid");
  const value = parsed.data;
  await db
    .transaction(async (tx) => {
      // Serialize sequence allocation per run across database connections.
      await tx
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(eq(agentRuns.id, runId))
        .for("update");
      await tx.execute(sql`insert into ${agentToolCalls} (run_id, seq, actor, tool, input, output, ok)
    select ${runId}, coalesce(max(${agentToolCalls.seq}), 0) + 1, ${value.actor}, ${value.tool},
      ${JSON.stringify(value.input)}::jsonb, ${JSON.stringify(value.output)}::jsonb, ${value.ok}
    from ${agentToolCalls} where ${agentToolCalls.runId} = ${runId}`);
    })
    .catch(() => {
      throw new Error("Tool call save failed");
    });
}

export async function finishAgentRun(
  db: Db,
  runId: string,
  result: {
    status: "completed" | "failed";
    error: string | null;
    summary: CloseSummary | null;
    aiStatus: AiStatus | null;
    aiCostUsd: string;
  },
): Promise<void> {
  const parsed = z
    .object({
      status: z.enum(["completed", "failed"]),
      error: z.string().nullable(),
      summary: closeSummarySchema.nullable(),
      aiStatus: z.enum(aiStatuses).nullable(),
      aiCostUsd: z.string().regex(/^\d+(\.\d+)?$/),
    })
    .safeParse(result);
  if (!parsed.success) throw new Error("Agent run result is invalid");
  await db
    .update(agentRuns)
    .set({ ...parsed.data, finishedAt: sql`now()` })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, "running")))
    .catch(() => {
      throw new Error("Agent run save failed");
    });
}

export async function listAgentRuns(
  db: Db,
  userId: string,
  kinds: readonly AgentRunKind[],
  limit: number,
): Promise<AgentRun[]> {
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), inArray(agentRuns.kind, kinds)))
    .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
    .limit(limit)
    .catch(() => {
      throw new Error("Agent run lookup failed");
    });
  if (!rows.length) return [];
  const calls = await db
    .select()
    .from(agentToolCalls)
    .where(
      inArray(
        agentToolCalls.runId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(agentToolCalls.seq))
    .catch(() => {
      throw new Error("Agent run lookup failed");
    });
  return rows.map((row) => {
    const result = agentRunSchema.safeParse({
      ...row,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      toolCalls: calls
        .filter((call) => call.runId === row.id)
        .map((call) => ({ ...call, createdAt: call.createdAt?.toISOString() })),
    });
    if (!result.success) throw new Error("Stored agent run is invalid");
    return result.data;
  });
}

export async function aiSpendSince(db: Db, since: Date): Promise<string> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${agentRuns.aiCostUsd}), 0)::text` })
    .from(agentRuns)
    .where(gte(agentRuns.startedAt, since))
    .catch(() => {
      throw new Error("AI spend lookup failed");
    });
  const result = z.object({ total: z.string().regex(/^\d+(\.\d+)?$/) }).safeParse(row);
  if (!result.success) throw new Error("Stored AI spend is invalid");
  return result.data.total;
}

export async function monthLedger(db: Db, userId: string, month: string) {
  const parsedMonth = agentRunSchema.shape.month.safeParse(month);
  if (!parsedMonth.success) throw new Error("Ledger month is invalid");
  const rows = await db
    .select({
      kind: payments.kind,
      count: sql<number>`count(*)::int`,
      currency: payments.currency,
      gross: sql<string>`sum(${payments.gross})::text`,
      fee: sql<
        string | null
      >`case when count(${payments.fee}) = count(*) then sum(${payments.fee})::text end`,
      net: sql<
        string | null
      >`case when count(${payments.net}) = count(*) then sum(${payments.net})::text end`,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(
      and(
        eq(invoices.userId, userId),
        inArray(payments.kind, ["payment", "refund"]),
        sql`to_char(${payments.receivedAt} at time zone 'Asia/Kolkata', 'YYYY-MM') = ${parsedMonth.data}`,
      ),
    )
    .groupBy(payments.kind, payments.currency)
    .orderBy(asc(payments.currency))
    .catch(() => {
      throw new Error("Month ledger lookup failed");
    });
  const totals = z
    .array(
      currencyTotalSchema.extend({
        kind: z.enum(["payment", "refund"]),
        count: z.int().nonnegative(),
      }),
    )
    .safeParse(rows);
  if (!totals.success) throw new Error("Stored month ledger is invalid");
  const [disputeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disputes)
    .innerJoin(invoices, eq(invoices.id, disputes.invoiceId))
    .where(and(eq(invoices.userId, userId), ne(disputes.status, "RESOLVED")))
    .catch(() => {
      throw new Error("Month ledger lookup failed");
    });
  const [firaRow] = await db
    .select({
      lines: sql<number>`count(*)::int`,
      needsConfirmation: sql<number>`count(*) filter (where ${matches.firaLineId} is not null and
      case when ${matches.confidence} >= 0.90 or ${matches.confirmedByUser} then false else true end)::int`,
      unmatched: sql<number>`count(*) filter (where ${matches.firaLineId} is null)::int`,
    })
    .from(firaLines)
    .innerJoin(firaDocuments, eq(firaDocuments.id, firaLines.firaDocumentId))
    .leftJoin(matches, eq(matches.firaLineId, firaLines.id))
    .where(
      and(
        eq(firaDocuments.userId, userId),
        sql`to_char(${firaLines.date}, 'YYYY-MM') = ${parsedMonth.data}`,
      ),
    )
    .catch(() => {
      throw new Error("Month ledger lookup failed");
    });
  const counts = z
    .object({
      disputes: z.object({ count: z.int().nonnegative() }),
      fira: z.object({
        lines: z.int().nonnegative(),
        needsConfirmation: z.int().nonnegative(),
        unmatched: z.int().nonnegative(),
      }),
    })
    .safeParse({ disputes: disputeRow, fira: firaRow });
  if (!counts.success) throw new Error("Stored month ledger is invalid");
  const paid = totals.data.filter((row) => row.kind === "payment");
  const refunded = totals.data.filter((row) => row.kind === "refund");
  return {
    payments: {
      count: paid.reduce((sum, row) => sum + row.count, 0),
      totals: paid.map(({ currency, gross, fee, net }) => ({ currency, gross, fee, net })),
    },
    refunds: {
      count: refunded.reduce((sum, row) => sum + row.count, 0),
      totals: refunded.map(({ currency, gross }) => ({ currency, gross })),
    },
    openDisputes: counts.data.disputes.count,
    fira: counts.data.fira,
  };
}
