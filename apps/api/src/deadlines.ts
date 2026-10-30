import { type Db, ensureTask } from "@niryat/db";
import type { InvoiceView } from "@niryat/shared";

export async function ensureDeadlineTasks(
  db: Db,
  userId: string,
  views: readonly InvoiceView[],
): Promise<number> {
  let overdue = 0;
  for (const view of views) {
    const deadline = view.compliance.deadline;
    if (!deadline?.overdue) continue;
    await ensureTask(db, {
      userId,
      invoiceId: view.id,
      type: "rbi_deadline_passed",
      dueDate: deadline.deadline,
      message: deadline.message,
      sourceRuleId: deadline.citation.ruleId,
      dedupeKey: `rbi:${view.id}:overdue`,
    });
    overdue += 1;
  }
  return overdue;
}
