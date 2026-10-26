import type { ActionStore } from "@niryat/agent";
import { actionSchema } from "@niryat/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client";
import { agentActions } from "./schema";

export function actionStore(db: Db): ActionStore {
  return {
    async claim(actionId, userId) {
      const [row] = await db
        .update(agentActions)
        .set({ status: "approved", updatedAt: sql`now()` })
        .where(
          and(
            eq(agentActions.id, actionId),
            eq(agentActions.userId, userId),
            inArray(agentActions.status, ["proposed", "failed"]),
          ),
        )
        .returning()
        .catch(() => {
          throw new Error("Action save failed");
        });
      if (!row) return undefined;
      const result = actionSchema.safeParse({ ...row, createdAt: row.createdAt?.toISOString() });
      if (!result.success) throw new Error("Stored action is invalid");
      return { ...result.data, userId: row.userId };
    },
    async finish(actionId, outcome) {
      await db
        .update(agentActions)
        .set({
          status: outcome.status,
          error: outcome.status === "done" ? null : outcome.error,
          updatedAt: sql`now()`,
        })
        .where(and(eq(agentActions.id, actionId), eq(agentActions.status, "approved")))
        .catch(() => {
          throw new Error("Action save failed");
        });
    },
  };
}

export async function rejectAction(db: Db, userId: string, actionId: string): Promise<boolean> {
  const rows = await db
    .update(agentActions)
    .set({ status: "rejected", updatedAt: sql`now()` })
    .where(
      and(
        eq(agentActions.id, actionId),
        eq(agentActions.userId, userId),
        inArray(agentActions.status, ["proposed", "failed"]),
      ),
    )
    .returning({ id: agentActions.id })
    .catch(() => {
      throw new Error("Action save failed");
    });
  return rows.length > 0;
}
