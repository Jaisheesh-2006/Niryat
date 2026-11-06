import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { calendarEventSchema, taskSchema } from "@niryat/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";

describe.skipIf(!testDatabaseUrl)("task planning", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const secret = "x".repeat(32);
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => t.reset());
  afterAll(async () => t?.close());

  it("persists and clears only the owner's open task plan, preserving due date and deadlines", async () => {
    const owner = await db.createUser(t.db, { email: "plan@example.test", passwordHash: "unused" });
    const other = await db.createUser(t.db, {
      email: "other@example.test",
      passwordHash: "unused",
    });
    if (!owner || !other) throw new Error("Expected users");
    await db.ensureTask(t.db, {
      userId: owner.id,
      invoiceId: null,
      type: "agent_suggestion",
      dueDate: "2026-11-10",
      message: "Check records",
      sourceRuleId: "TEST",
      dedupeKey: "plan",
    });
    const [task] = await db.listTasks(t.db, owner.id);
    if (!task) throw new Error("Expected task");
    expect(task.plannedDate).toBeNull();
    const app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: secret,
      secureCookies: false,
    });
    const cookie = await cookieFor(owner.id, secret);
    const post = (body: unknown, session = cookie, id = task.id) =>
      app.request(`/tasks/${id}/plan`, {
        method: "POST",
        headers: { Cookie: session, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const calendar = async () =>
      calendarEventSchema
        .array()
        .parse(await (await app.request("/calendar", { headers: { Cookie: cookie } })).json());
    const before = await calendar();
    expect(before.find((event) => event.kind === "planned_task")?.date).toBe(task.dueDate);
    for (const session of ["", await cookieFor(other.id, secret, "ca")]) {
      expect((await post({ plannedDate: "2026-11-09" }, session)).status).toBe(401);
    }
    expect(
      (await post({ plannedDate: "2026-11-09" }, await cookieFor(other.id, secret))).status,
    ).toBe(404);
    expect((await post({ plannedDate: null }, cookie, randomUUID())).status).toBe(404);
    expect((await post({ plannedDate: null }, cookie, "bad-id")).status).toBe(404);
    for (const body of [
      {},
      { plannedDate: "2026-02-30" },
      { plannedDate: "tomorrow" },
      { plannedDate: 1 },
      { plannedDate: "2026-11-09", dueDate: null },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(
      (
        await app.request(`/tasks/${task.id}/plan`, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request(`/tasks/${task.id}/plan`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    const planned = await post({ plannedDate: "2026-11-09" });
    expect(planned.status).toBe(200);
    expect(taskSchema.parse(await planned.json())).toMatchObject({
      plannedDate: "2026-11-09",
      dueDate: task.dueDate,
    });
    expect((await db.listTasks(t.db, owner.id))[0]?.plannedDate).toBe("2026-11-09");
    const after = await calendar();
    expect(after.find((event) => event.kind === "planned_task")).toMatchObject({
      id: `task:${task.id}`,
      date: "2026-11-09",
      ruleId: null,
    });
    expect(after.filter((event) => event.kind !== "planned_task")).toEqual(
      before.filter((event) => event.kind !== "planned_task"),
    );
    const otherEvents = calendarEventSchema
      .array()
      .parse(
        await (
          await app.request("/calendar", { headers: { Cookie: await cookieFor(other.id, secret) } })
        ).json(),
      );
    expect(otherEvents.some((event) => event.kind === "planned_task")).toBe(false);
    expect(
      taskSchema.parse(await (await post({ plannedDate: null })).json()).plannedDate,
    ).toBeNull();
    await db.completeTask(t.db, owner.id, task.id);
    expect((await post({ plannedDate: "2026-11-12" })).status).toBe(404);
    expect((await calendar()).some((event) => event.kind === "planned_task")).toBe(false);
  });
});
