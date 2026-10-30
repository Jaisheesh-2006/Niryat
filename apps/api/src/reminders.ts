import { type Db, proposeReminder } from "@niryat/db";
import type { agentAdviceSchema, InvoiceView } from "@niryat/shared";
import type { z } from "zod";

type AgentAdvice = z.infer<typeof agentAdviceSchema>;

export interface ReminderCandidate {
  invoiceId: string;
  invoiceNumber: string;
  stage: 60 | 30;
  paypalInvoiceId: string;
}

export function reminderCandidates(
  views: readonly InvoiceView[],
  existingKeys: ReadonlySet<string>,
): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = [];
  for (const view of views) {
    const deadline = view.compliance.deadline;
    if (
      (view.status !== "sent" && view.status !== "partially_paid") ||
      view.paypalInvoiceId === null ||
      !deadline ||
      deadline.stage === null ||
      deadline.overdue ||
      existingKeys.has(`reminder:${view.id}:${deadline.stage}`)
    )
      continue;
    candidates.push({
      invoiceId: view.id,
      invoiceNumber: view.number,
      stage: deadline.stage,
      paypalInvoiceId: view.paypalInvoiceId,
    });
  }
  return candidates;
}

export function buildReminderPayload(
  c: ReminderCandidate,
  agent: AgentAdvice | null,
): Record<string, unknown> {
  return {
    invoiceId: c.invoiceId,
    stage: c.stage,
    paypalInvoiceId: c.paypalInvoiceId,
    agent,
    remind: { send_to_invoicer: false, send_to_recipient: true },
  };
}

export async function proposeReminders(
  deps: { db: Db },
  userId: string,
  candidates: readonly ReminderCandidate[],
  drafts: ReadonlyMap<string, AgentAdvice>,
): Promise<{
  proposed: {
    actionId: string;
    invoiceNumber: string;
    stage: 60 | 30;
    advice: AgentAdvice | null;
  }[];
  existing: number;
}> {
  const proposed: {
    actionId: string;
    invoiceNumber: string;
    stage: 60 | 30;
    advice: AgentAdvice | null;
  }[] = [];
  let existing = 0;
  for (const candidate of candidates) {
    const key = `reminder:${candidate.invoiceId}:${candidate.stage}`;
    const advice = drafts.get(key) ?? null;
    const result = await proposeReminder(deps.db, userId, {
      invoiceId: candidate.invoiceId,
      dedupeKey: key,
      payload: buildReminderPayload(candidate, advice),
    });
    if (!result.ok) {
      if (result.reason === "not_found") throw new Error("Reminder invoice not found");
      existing += 1;
      continue;
    }
    proposed.push({
      actionId: result.actionId,
      invoiceNumber: candidate.invoiceNumber,
      stage: candidate.stage,
      advice,
    });
  }
  return { proposed, existing };
}
