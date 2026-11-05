import { expect, it, vi } from "vitest";
import { createCloseDispatcher } from "./workflows";

const input = {
  userId: "40000000-0000-4000-8000-000000000001",
  runId: "40000000-0000-4000-8000-000000000002",
  month: "2026-11",
  asOf: "2026-11-05",
  trigger: "manual",
} as const;

it("dispatches the reserved manual run once without waiting for task completion", async () => {
  const get = vi.fn();
  const startTask = vi.fn(async () => ({ taskRunId: "task-run", get }));
  await createCloseDispatcher({ startTask })(input);
  expect(startTask).toHaveBeenCalledExactlyOnceWith("niryat-worker/monthlyClose", [input], {
    idempotencyKey: input.runId,
  });
  expect(get).not.toHaveBeenCalled();
});

it.each([
  { ...input, userId: "invalid" },
  { ...input, trigger: "scheduled" },
  { ...input, private: "ignored?" },
])("validates input before dispatch (%j)", async (value) => {
  const startTask = vi.fn();
  await expect(createCloseDispatcher({ startTask })(value)).rejects.toThrow();
  expect(startTask).not.toHaveBeenCalled();
});

it.each([{}, { taskRunId: "" }, { taskRunId: 123 }])(
  "validates Render acknowledgement %j",
  async (result) => {
    await expect(
      createCloseDispatcher({ startTask: vi.fn(async () => result) })(input),
    ).rejects.toThrow();
  },
);

it("propagates a dispatch failure without an in-process fallback", async () => {
  const startTask = vi.fn(async () => {
    throw new Error("dispatch failed");
  });
  await expect(createCloseDispatcher({ startTask })(input)).rejects.toThrow("dispatch failed");
  expect(startTask).toHaveBeenCalledOnce();
});
