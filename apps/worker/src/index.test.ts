import { runScheduledCloseFromEnv } from "@niryat/api/close";
import { beforeEach, expect, it, vi } from "vitest";
import { monthlyClose, monthlyCloseInputSchema } from "./index";

vi.mock("@niryat/api/close", () => ({ runScheduledCloseFromEnv: vi.fn() }));

const context = {
  metadata: {},
  run: async () => {
    throw new Error("unexpected_subtask");
  },
};

beforeEach(() => vi.resetAllMocks());

it.each([{}, { month: "2026-10" }, { month: "2026-10", asOf: "2027-06-01" }])(
  "accepts scheduled input %j",
  (input) => expect(monthlyCloseInputSchema.parse(input)).toEqual(input),
);

it.each([{ userId: "example" }, { month: "2026-99" }, { asOf: "2027-02-29" }])(
  "rejects invalid task input %j before running a close",
  (input) => {
    expect(() => monthlyClose.func(context, input)).toThrow();
    expect(runScheduledCloseFromEnv).not.toHaveBeenCalled();
  },
);

it.each([{}, { month: "2026-10", asOf: "2027-06-01" }])(
  "runs the scheduled close for %j",
  async (input) => {
    const result = { users: 2, completed: 2, failed: 0, running: 0 };
    vi.mocked(runScheduledCloseFromEnv).mockResolvedValue(result);
    expect(await monthlyClose.func(context, input)).toEqual(result);
    expect(runScheduledCloseFromEnv).toHaveBeenCalledExactlyOnceWith(input);
  },
);

it("propagates a close failure to the workflow", async () => {
  vi.mocked(runScheduledCloseFromEnv).mockRejectedValue(new Error("close_failed"));
  await expect(monthlyClose.func(context, {})).rejects.toThrow("close_failed");
});
