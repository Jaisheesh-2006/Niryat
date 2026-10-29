import { type Task, taskSchema } from "@niryat/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { tasks } from "./schema";

function parseTask(row: typeof tasks.$inferSelect): Task {
  const result = taskSchema.safeParse({
    ...row,
    createdAt: row.createdAt?.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
  });
  if (!result.success) throw new Error("Stored task is invalid");
  return result.data;
}

export async function ensureTask(
  db: Db,
  task: {
    userId: string;
    invoiceId: string | null;
    type: Task["type"];
    dueDate: string | null;
    message: string;
    sourceRuleId: string;
    dedupeKey: string;
  },
): Promise<void> {
  await db
    .insert(tasks)
    .values(task)
    .onConflictDoNothing({ target: tasks.dedupeKey })
    .catch(() => {
      throw new Error("Task save failed");
    });
}

export async function listTasks(db: Db, userId: string): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(
      sql`case when ${tasks.status} = 'open' then 0 else 1 end`,
      sql`case when ${tasks.status} = 'open' then ${tasks.dueDate} end asc nulls last`,
      sql`case when ${tasks.status} = 'open' then ${tasks.createdAt} end asc`,
      desc(tasks.doneAt),
    )
    .catch(() => {
      throw new Error("Task lookup failed");
    });
  return rows.map(parseTask);
}

export async function completeTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<Task | undefined> {
  const [row] = await db
    .update(tasks)
    .set({ status: "done", doneAt: sql`coalesce(${tasks.doneAt}, now())` })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning()
    .catch(() => {
      throw new Error("Task save failed");
    });
  return row ? parseTask(row) : undefined;
}
