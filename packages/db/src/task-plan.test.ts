import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completeTask, createUser, ensureTask, listTasks, planTask } from "./index";
import { openTestDb, testDatabaseUrl } from "./testing";

describe.skipIf(!testDatabaseUrl)("task planned date", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => t.reset());
  afterAll(async () => t?.close());
  it("validates, isolates and updates only open tasks without changing due dates or dedupe", async () => {
    const user = await createUser(t.db, { email: "plan@example.test", passwordHash: "unused" });
    if (!user) throw new Error("Expected user");
    const input = {
      userId: user.id,
      invoiceId: null,
      type: "agent_suggestion" as const,
      dueDate: "2026-11-10",
      message: "Check records",
      sourceRuleId: "TEST",
      dedupeKey: "plan",
    };
    await ensureTask(t.db, input);
    const [task] = await listTasks(t.db, user.id);
    if (!task) throw new Error("Expected task");
    expect(task.plannedDate).toBeNull();
    await expect(planTask(t.db, user.id, task.id, { plannedDate: "2026-02-30" })).rejects.toThrow();
    expect(await planTask(t.db, randomUUID(), task.id, { plannedDate: null })).toBeUndefined();
    expect(await planTask(t.db, user.id, randomUUID(), { plannedDate: null })).toBeUndefined();
    expect(await planTask(t.db, user.id, task.id, { plannedDate: "2026-12-31" })).toMatchObject({
      plannedDate: "2026-12-31",
      dueDate: task.dueDate,
    });
    expect(await ensureTask(t.db, input)).toBe(false);
    expect((await listTasks(t.db, user.id))[0]?.plannedDate).toBe("2026-12-31");
    expect(await planTask(t.db, user.id, task.id, { plannedDate: null })).toEqual(task);
    await completeTask(t.db, user.id, task.id);
    expect(await planTask(t.db, user.id, task.id, { plannedDate: null })).toBeUndefined();
  });
});
