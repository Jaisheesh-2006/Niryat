import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type ClaudeRunner,
  type CloseDataSource,
  type CloseDrafts,
  createClaudeRunner,
  createToolkitReader,
  type PayPalReader,
  runCloseAgent,
} from "@niryat/agent";
import {
  aiSpendSince,
  createDb,
  type Db,
  ensureTask,
  finishAgentRun,
  listFiraDocuments,
  listInvoices,
  listReminderActions,
  listUserIds,
  logToolCall,
  monthLedger,
  parseEncryptionKey,
  reminderKeys,
  startAgentRun,
} from "@niryat/db";
import {
  createPayPalLedger,
  createPayPalRestClient,
  type PayPalLedger,
  type PayPalRestClient,
} from "@niryat/paypal";
import { cite } from "@niryat/rules";
import {
  type AgentRunTrigger,
  agentRunSchema,
  type CloseSummary,
  closeSummarySchema,
  reminderStageSchema,
} from "@niryat/shared";
import { z } from "zod";
import { toInvoiceView } from "./compliance";
import { ensureDeadlineTasks } from "./deadlines";
import { loadAiEnv, loadAuthEnv, loadEnv, loadPayPalEnv } from "./env";
import { proposeReminders, reminderCandidates } from "./reminders";
import { indiaDate, rules } from "./rules";
import { syncDisputes, syncPayments } from "./sync";

export interface CloseDeps {
  db: Db;
  encryptionKey: Buffer;
  paypal?: {
    rest: Pick<PayPalRestClient, "get">;
    ledger: Pick<PayPalLedger, "searchTransactions" | "getCapture" | "getRefund">;
  };
  ai?: { runner: ClaudeRunner; monthlyBudgetUsd: string; paypalReader?: PayPalReader };
}

type Run = {
  runId: string;
  userId: string;
  kind: "monthly_close" | "reminders";
  month: string;
  asOf: string;
};

async function executeRun(
  deps: CloseDeps,
  run: Run,
  now: Date,
  counts: { proposed: number },
): Promise<void> {
  const { db } = deps;
  let ai: CloseSummary["ai"] = { status: "unavailable", costUsd: "0" };
  let auditFailed = false;
  let tasksCreated = 0;
  async function step<T>(
    tool: string,
    input: unknown,
    work: () => Promise<T>,
    output: (value: T) => unknown = (value) => value,
    fallback?: () => T,
  ): Promise<T> {
    let value: T;
    try {
      value = await work();
    } catch {
      await logToolCall(db, run.runId, {
        actor: "system",
        tool,
        input,
        output: { error: `${tool}_failed` },
        ok: false,
      });
      if (fallback) return fallback();
      throw new Error(`${tool}_failed`);
    }
    await logToolCall(db, run.runId, {
      actor: "system",
      tool,
      input,
      output: output(value),
      ok: true,
    });
    return value;
  }
  try {
    const sync: CloseSummary["sync"] = { payments: "skipped", disputes: "skipped" };
    if (run.kind === "monthly_close") {
      for (const name of ["payments", "disputes"] as const) {
        await step(
          `sync_${name}`,
          {},
          async () => {
            if (!deps.paypal) return { skipped: "paypal_unavailable" };
            const result =
              name === "payments"
                ? await syncPayments({ db, ledger: deps.paypal.ledger }, now)
                : await syncDisputes({ db, ...deps.paypal }, now);
            sync[name] = result.failed > 0 ? "failed" : "done";
            return result;
          },
          undefined,
          () => {
            sync[name] = "failed";
            return { skipped: "sync_failed" };
          },
        );
      }
    }
    const views = await step(
      "load_invoices",
      {},
      async () =>
        (await listInvoices(db, run.userId)).map((invoice) =>
          toInvoiceView(invoice, null, run.asOf),
        ),
      (value) => ({
        invoices: value.length,
        withDeadline: value.filter((v) => v.compliance.deadline).length,
      }),
    );
    const deadlineTasks = await step(
      "ensure_deadline_tasks",
      {},
      () => ensureDeadlineTasks(db, run.userId, views),
      ({ overdue }) => ({ overdue }),
    );
    tasksCreated += deadlineTasks.created;

    const ledger =
      run.kind === "monthly_close"
        ? await step(
            "month_ledger",
            { month: run.month },
            () => monthLedger(db, run.userId, run.month),
            ({ payments, refunds }) => ({ payments, refunds }),
          )
        : null;
    const fira: CloseSummary["fira"] = {
      state:
        run.month >= run.asOf.slice(0, 7)
          ? "not_due"
          : ledger?.fira.lines
            ? "covered"
            : ledger?.payments.count
              ? "missing"
              : "not_needed",
      needsConfirmation: ledger?.fira.needsConfirmation ?? 0,
      unmatched: ledger?.fira.unmatched ?? 0,
    };
    if (run.kind === "monthly_close") {
      await step("ensure_fira_task", {}, async () => {
        if (fira.state === "missing") {
          const label = new Date(`${run.month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          });
          const inserted = await ensureTask(db, {
            userId: run.userId,
            invoiceId: null,
            type: "fira_missing",
            dueDate: null,
            sourceRuleId: "RBI_REALISATION",
            dedupeKey: `fira:${run.userId}:${run.month}`,
            message: `Upload your PayPal FIRA for ${label} so Niryat can match it to that month's PayPal payments.`,
          });
          if (inserted) tasksCreated += 1;
        }
        return { state: fira.state };
      });
    }
    const keys = await reminderKeys(db, run.userId);
    const due = reminderCandidates(views, new Set());
    const candidates = await step(
      "reminder_candidates",
      {},
      async () => reminderCandidates(views, keys),
      (value) => value.map(({ invoiceNumber, stage }) => ({ invoiceNumber, stage })),
    );
    const actions = await listReminderActions(db, run.userId, 2_147_483_647);
    const reminders = actions.map((action) => ({
      ...action,
      stage: z.object({ stage: reminderStageSchema }).parse(action.payload).stage,
    }));
    const lines = (await listFiraDocuments(db, run.userId))
      .flatMap((doc) => doc.lines)
      .filter((line) => line.date.startsWith(`${run.month}-`));
    const disputes = views.flatMap((invoice) =>
      invoice.disputes.map((dispute) => ({
        ...dispute,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
      })),
    );
    const openDisputes = disputes.filter((dispute) => dispute.status !== "RESOLVED");
    const overview = {
      month: run.month,
      asOf: run.asOf,
      payments: ledger?.payments ?? { count: 0, totals: [] },
      refunds: ledger?.refunds ?? { count: 0, totals: [] },
      openDisputes: openDisputes.length,
      fira,
      sync,
    };
    const data: CloseDataSource = {
      async overview() {
        return overview;
      },
      async openInvoices() {
        return views.flatMap((invoice) => {
          const deadline = invoice.compliance.deadline;
          return deadline
            ? [
                {
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.number,
                  clientId: invoice.clientId,
                  clientName: invoice.clientName,
                  status: invoice.status,
                  currency: invoice.currency,
                  amount: invoice.amount,
                  received: invoice.compliance.realisation.received,
                  shortfall: invoice.compliance.realisation.shortfall,
                  deadline: deadline.deadline,
                  daysRemaining: deadline.daysRemaining,
                  stage: deadline.stage,
                  overdue: deadline.overdue,
                  reminderCandidate: candidates.some((c) => c.invoiceId === invoice.id),
                  reminders: reminders
                    .filter((a) => a.invoiceId === invoice.id)
                    .map(({ stage, status }) => ({ stage, status })),
                  openDisputes: openDisputes.filter((d) => d.invoiceId === invoice.id).length,
                },
              ]
            : [];
        });
      },
      async clientHistory(clientId) {
        const invoices = views.filter((v) => v.clientId === clientId);
        const first = invoices[0];
        if (!first) return null;
        return {
          clientName: first.clientName,
          invoices: invoices.length,
          paid: invoices.filter((v) => v.status === "paid").length,
          open: invoices.filter((v) => v.compliance.deadline !== null).length,
          refunded: invoices.filter(
            (v) => v.status === "refunded" || v.status === "partially_refunded",
          ).length,
          openDisputes: invoices.reduce(
            (n, v) => n + v.disputes.filter((d) => d.status !== "RESOLVED").length,
            0,
          ),
          lastPaymentOn:
            invoices
              .flatMap((v) => v.payments.map((p) => indiaDate(p.receivedAt)))
              .sort()
              .at(-1) ?? null,
        };
      },
      async firaIssues() {
        return lines
          .filter((line) => line.match?.state !== "matched")
          .map((line) => ({
            lineId: line.id,
            date: line.date,
            currency: line.currency,
            amount: line.amount,
            state: line.match?.state ?? "unmatched",
            note: line.note,
          }));
      },
      async openDisputes() {
        return openDisputes.map(
          ({ paypalDisputeId, invoiceId, invoiceNumber, status, responseDueDate }) => ({
            paypalDisputeId,
            invoiceId,
            invoiceNumber,
            status,
            responseDueDate,
          }),
        );
      },
    };
    let drafts: CloseDrafts = { reminders: new Map(), tasks: [], summary: null };
    await step(
      "claude",
      {},
      async () => {
        if (!deps.ai) return ai;
        const month = indiaDate(now).slice(0, 7);
        const remaining =
          Number(deps.ai.monthlyBudgetUsd) -
          Number(await aiSpendSince(db, new Date(`${month}-01T00:00:00+05:30`)));
        if (remaining <= 0) {
          ai = { status: "budget_exhausted", costUsd: "0" };
          return ai;
        }
        const maxBudgetUsd = Math.min(remaining, 0.75);
        ai = { status: "failed", costUsd: maxBudgetUsd.toFixed(4) };
        const result = await runCloseAgent(
          deps.ai.runner,
          {
            kind: run.kind,
            data,
            known: {
              candidates,
              invoiceIds: new Set(views.map((v) => v.id)),
              clientIds: new Set(views.map((v) => v.clientId)),
              disputeIds: new Set(disputes.map((d) => d.paypalDisputeId)),
              firaLineIds: new Set(lines.map((line) => line.id)),
              paypalInvoiceIds: new Set(
                views.flatMap((v) => (v.paypalInvoiceId ? [v.paypalInvoiceId] : [])),
              ),
              paypalTxnIds: new Set(views.flatMap((v) => v.payments.map((p) => p.paypalTxnId))),
              month: run.month,
            },
            ...(deps.paypal && deps.ai.paypalReader ? { paypal: deps.ai.paypalReader } : {}),
          },
          {
            maxBudgetUsd,
            log: async (call) => {
              try {
                await logToolCall(db, run.runId, { ...call, actor: "agent" });
              } catch {
                auditFailed = true;
                throw new Error("agent_log_failed");
              }
            },
          },
        );
        drafts = result.drafts;
        ai = z
          .object({
            status: z.enum(["used", "failed", "budget_exhausted"]),
            costUsd: z.string().regex(/^\d+(\.\d+)?$/),
          })
          .parse(result);
        if (auditFailed) throw new Error("agent_log_failed");
        return ai;
      },
      undefined,
      () => {
        ai = { ...ai, status: "failed" };
        if (auditFailed) throw new Error("agent_log_failed");
        return ai;
      },
    );
    const proposals = await step(
      "propose_reminders",
      {},
      async () => {
        const result: Awaited<ReturnType<typeof proposeReminders>> = {
          proposed: [],
          existing: due.length - candidates.length,
        };
        for (const candidate of candidates) {
          const saved = await proposeReminders({ db }, run.userId, [candidate], drafts.reminders);
          counts.proposed += saved.proposed.length;
          result.proposed.push(...saved.proposed);
          result.existing += saved.existing;
        }
        return result;
      },
      (value) => ({
        proposed: value.proposed.map(({ invoiceNumber, stage, advice }) => ({
          invoiceNumber,
          stage,
          advice,
        })),
        existing: value.existing,
      }),
    );
    if (run.kind === "monthly_close") {
      await step("save_suggested_tasks", {}, async () => {
        let created = 0;
        for (const task of drafts.tasks) {
          const invoice = views.find((v) => v.id === task.entityId);
          const dispute = disputes.find((d) => d.paypalDisputeId === task.entityId);
          const line = lines.find((l) => l.id === task.entityId);
          let message: string;
          let invoiceId: string | null;
          let dueDate: string | null = null;
          let sourceRuleId = "RBI_REALISATION";
          switch (task.kind) {
            case "follow_up_client":
              if (!invoice) throw new Error("unknown_entity");
              invoiceId = invoice.id;
              message = `Contact ${invoice.clientName} about invoice ${invoice.number}. Claude's reason: ${task.reason}`;
              break;
            case "review_dispute":
              if (!dispute) throw new Error("unknown_entity");
              invoiceId = dispute.invoiceId;
              dueDate = dispute.responseDueDate;
              sourceRuleId = "REALISATION_ADJUSTMENT";
              message = `Review PayPal dispute ${dispute.paypalDisputeId} on invoice ${dispute.invoiceNumber}. Claude's reason: ${task.reason}`;
              break;
            case "confirm_fira_match":
              if (!line) throw new Error("unknown_entity");
              invoiceId = line.match?.invoiceId ?? null;
              message = `Review the FIRA line dated ${line.date} on the FIRA page. Claude's reason: ${task.reason}`;
              break;
            default: {
              const never: never = task.kind;
              throw new Error(`unknown_task: ${never}`);
            }
          }
          const inserted = await ensureTask(db, {
            userId: run.userId,
            invoiceId,
            dueDate,
            sourceRuleId,
            message,
            type: "agent_suggestion",
            dedupeKey: `agent:${run.userId}:${run.month}:${task.kind}:${task.entityId}`,
          });
          if (inserted) created += 1;
        }
        tasksCreated += created;
        return { created, existing: drafts.tasks.length - created };
      });
    }
    const focus =
      drafts.summary?.focus.map((item) => {
        let label: string;
        switch (item.entityType) {
          case "invoice":
            label = `Invoice ${views.find((v) => v.id === item.entityId)?.number}`;
            break;
          case "dispute": {
            const dispute = disputes.find((d) => d.paypalDisputeId === item.entityId);
            label = `Dispute ${item.entityId} (invoice ${dispute?.invoiceNumber})`;
            break;
          }
          case "fira_line":
            label = `FIRA line dated ${lines.find((l) => l.id === item.entityId)?.date}`;
            break;
          default: {
            const never: never = item.entityType;
            throw new Error(`unknown_entity: ${never}`);
          }
        }
        return { label, reason: item.reason };
      }) ?? [];
    const summary =
      run.kind === "monthly_close"
        ? closeSummarySchema.parse({
            ...overview,
            proposals: proposals.proposed,
            ai,
            focus,
            note: drafts.summary?.note ?? null,
            suggestedTasks: drafts.tasks.length,
            tasksCreated,
            deadlines: views.flatMap((v) =>
              v.compliance.deadline
                ? [
                    {
                      invoiceId: v.id,
                      invoiceNumber: v.number,
                      ...v.compliance.deadline,
                    },
                  ]
                : [],
            ),
            citations: [cite(rules, "RBI_REALISATION"), cite(rules, "REALISATION_ADJUSTMENT")],
          })
        : null;
    await finishAgentRun(db, run.runId, {
      status: "completed",
      error: null,
      summary,
      aiStatus: ai.status,
      aiCostUsd: ai.costUsd,
    });
  } catch {
    await finishAgentRun(db, run.runId, {
      status: "failed",
      error: "close_failed",
      summary: null,
      aiStatus: ai.status,
      aiCostUsd: ai.costUsd,
    });
    throw new Error("close_failed");
  }
}

export async function executeAgentRun(deps: CloseDeps, run: Run, now: Date): Promise<void> {
  await executeRun(deps, run, now, { proposed: 0 });
}

async function startRun(
  deps: CloseDeps,
  input: Omit<Run, "runId"> & { trigger: AgentRunTrigger },
  now: Date,
): Promise<{ status: "completed" | "failed" | "running"; proposed: number }> {
  const started = await startAgentRun(deps.db, input, now);
  if (!started.ok) return { status: "running", proposed: 0 };
  const counts = { proposed: 0 };
  try {
    await executeRun(deps, { ...input, runId: started.runId }, now, counts);
    return { status: "completed", ...counts };
  } catch {
    return { status: "failed", ...counts };
  }
}

export async function startAndExecute(
  deps: CloseDeps,
  input: Omit<Run, "runId"> & { trigger: AgentRunTrigger },
  now: Date,
): Promise<"completed" | "failed" | "running"> {
  return (await startRun(deps, input, now)).status;
}

function scheduledInput(input: { month?: string; asOf?: string }, now: Date) {
  const parsed = z
    .strictObject({
      month: agentRunSchema.shape.month.optional(),
      asOf: z.iso.date().optional(),
    })
    .parse(input);
  const today = indiaDate(now);
  const asOf = parsed.asOf ?? today;
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 400);
  if (asOf < today || asOf > limit.toISOString().slice(0, 10)) throw new Error("invalid_as_of");
  const previous = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  return { month: parsed.month ?? previous.toISOString().slice(0, 7), asOf };
}

export async function closeAllUsers(
  deps: CloseDeps,
  input: { month?: string; asOf?: string },
  now: Date,
) {
  const dates = scheduledInput(input, now);
  const users = await listUserIds(deps.db);
  const result = { users: users.length, completed: 0, failed: 0, running: 0 };
  for (const userId of users) {
    try {
      result[
        await startAndExecute(
          deps,
          { ...dates, userId, kind: "monthly_close", trigger: "scheduled" },
          now,
        )
      ]++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

export async function nightlyReminders(deps: CloseDeps, now: Date) {
  const users = await listUserIds(deps.db);
  const result = { users: users.length, runs: 0, proposed: 0, failed: 0 };
  const asOf = indiaDate(now);
  for (const userId of users) {
    try {
      const views = (await listInvoices(deps.db, userId)).map((v) => toInvoiceView(v, null, asOf));
      await ensureDeadlineTasks(deps.db, userId, views);
      const keys = await reminderKeys(deps.db, userId);
      if (!reminderCandidates(views, keys).length) continue;
      const run = await startRun(
        deps,
        { userId, kind: "reminders", trigger: "nightly", month: asOf.slice(0, 7), asOf },
        now,
      );
      if (run.status === "running") continue;
      result.runs++;
      if (run.status === "failed") result.failed++;
      result.proposed += run.proposed;
    } catch {
      result.failed++;
    }
  }
  return result;
}

export async function runScheduledCloseFromEnv(input: { month?: string; asOf?: string }) {
  const now = new Date();
  scheduledInput(input, now);
  try {
    process.loadEnvFile(resolve("../../.env"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw new Error("Environment load failed");
  }
  loadEnv(process.env);
  const auth = loadAuthEnv(process.env);
  const paypal = loadPayPalEnv(process.env);
  const ai = loadAiEnv(process.env);
  if (!auth) throw new Error("Invalid environment: DATABASE_URL. See .env.example.");
  const encryptionKey = parseEncryptionKey(auth.ENCRYPTION_KEY);
  const credentials = paypal
    ? { clientId: paypal.PAYPAL_CLIENT_ID, clientSecret: paypal.PAYPAL_CLIENT_SECRET }
    : undefined;
  const database = createDb(auth.DATABASE_URL);
  try {
    return await closeAllUsers(
      {
        db: database.db,
        encryptionKey,
        ...(credentials
          ? {
              paypal: {
                rest: createPayPalRestClient(credentials),
                ledger: createPayPalLedger(credentials),
              },
            }
          : {}),
        ...(ai
          ? {
              ai: {
                runner: createClaudeRunner({
                  apiKey: ai.ANTHROPIC_API_KEY,
                  model: ai.CLAUDE_MODEL,
                }),
                monthlyBudgetUsd: ai.AI_MONTHLY_BUDGET_USD,
                ...(credentials ? { paypalReader: createToolkitReader(credentials) } : {}),
              },
            }
          : {}),
      },
      input,
      now,
    );
  } finally {
    await database.close();
  }
}

export async function main(args: string[] = []): Promise<void> {
  let input: { month?: string; asOf?: string };
  try {
    const { values } = parseArgs({
      args,
      options: { month: { type: "string" }, "as-of": { type: "string" } },
      allowPositionals: false,
    });
    input = {
      ...(values.month !== undefined ? { month: values.month } : {}),
      ...(values["as-of"] !== undefined ? { asOf: values["as-of"] } : {}),
    };
    scheduledInput(input, new Date());
  } catch {
    console.error("Invalid arguments: month, as-of.");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runScheduledCloseFromEnv(input);
    console.log(JSON.stringify(result));
    if (result.failed > 0) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error(
      /^Invalid environment: [A-Z_, ]+\. See \.env\.example\.$/.test(message) ||
        message === "ENCRYPTION_KEY must be 32 bytes, base64-encoded"
        ? message
        : "Monthly close failed",
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) void main(process.argv.slice(2));
