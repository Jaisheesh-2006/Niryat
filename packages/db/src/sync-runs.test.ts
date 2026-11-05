import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { finishSyncRun, readSyncStatus, startSyncRun } from "./sync-runs";
import { openTestDb, testDatabaseUrl } from "./testing";

describe.skipIf(!testDatabaseUrl)("sync-run storage", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const now = new Date("2026-11-05T12:00:00Z");
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("starts stale with no history and allows only one concurrent poll", async () => {
    expect(await readSyncStatus(t.db, now)).toEqual({
      lastSuccessAt: null,
      lastStatus: null,
      stale: true,
    });
    const ids = await Promise.all([startSyncRun(t.db, now), startSyncRun(t.db, now)]);
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect(await readSyncStatus(t.db, now)).toEqual({
      lastSuccessAt: null,
      lastStatus: "running",
      stale: true,
    });
  });

  it("retains the last success through running/failed polls and tests the exact stale boundary", async () => {
    const id = await startSyncRun(t.db, now);
    if (!id) throw new Error("Expected sync run");
    await finishSyncRun(t.db, id, "ok", { payments: { recorded: 1 } }, now);
    const failed = await startSyncRun(t.db, new Date(now.getTime() + 1));
    if (!failed) throw new Error("Expected next sync run");
    expect(await readSyncStatus(t.db, now)).toMatchObject({
      lastSuccessAt: now.toISOString(),
      lastStatus: "running",
      stale: false,
    });
    await finishSyncRun(
      t.db,
      failed,
      "failed",
      { payments: { failed: 1 } },
      new Date(now.getTime() + 1000),
    );
    await finishSyncRun(t.db, id, "failed", {}, new Date(now.getTime() + 2000));
    expect(await readSyncStatus(t.db, new Date(now.getTime() + 2 * 60 * 60_000 - 1))).toEqual({
      lastSuccessAt: now.toISOString(),
      lastStatus: "failed",
      stale: false,
    });
    expect(await readSyncStatus(t.db, new Date(now.getTime() + 2 * 60 * 60_000))).toEqual({
      lastSuccessAt: now.toISOString(),
      lastStatus: "failed",
      stale: true,
    });
    const recovered = await startSyncRun(t.db, new Date(now.getTime() + 2 * 60 * 60_000));
    if (!recovered) throw new Error("Expected recovery sync");
    const later = new Date(now.getTime() + 2 * 60 * 60_000 + 1000);
    await finishSyncRun(t.db, recovered, "ok", {}, later);
    expect(await readSyncStatus(t.db, later)).toEqual({
      lastSuccessAt: later.toISOString(),
      lastStatus: "ok",
      stale: false,
    });
  });

  it("rejects invalid count summaries", async () => {
    const id = await startSyncRun(t.db, now);
    if (!id) throw new Error("Expected sync run");
    await expect(finishSyncRun(t.db, id, "ok", { payments: { failed: -1 } }, now)).rejects.toThrow(
      "Sync run result is invalid",
    );
    await expect(finishSyncRun(t.db, id, "ok", { private: "data" }, now)).rejects.toThrow(
      "Sync run result is invalid",
    );
  });
});
