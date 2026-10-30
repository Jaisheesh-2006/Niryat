import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { main } from "./trigger";

vi.mock("@niryat/api/close", () => ({ runScheduledCloseFromEnv: vi.fn() }));

const startTask = vi.fn<() => Promise<unknown>>();
let exitCode: typeof process.exitCode;

beforeEach(() => {
  exitCode = process.exitCode;
  process.exitCode = 0;
  vi.stubEnv("RENDER_API_KEY", "test-key");
  vi.stubEnv("RENDER_USE_LOCAL_DEV", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  startTask.mockReset().mockResolvedValue({ taskRunId: "task-run-test", privateData: "omitted" });
});

afterEach(() => {
  process.exitCode = exitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each([
  { args: [], input: {} },
  { args: ["--as-of", "2027-06-01"], input: { asOf: "2027-06-01" } },
  { args: ["--", "--as-of", "2027-06-01"], input: { asOf: "2027-06-01" } },
  { args: ["--month", "2026-10"], input: { month: "2026-10" } },
  {
    args: ["--month", "2026-10", "--as-of", "2027-06-01"],
    input: { month: "2026-10", asOf: "2027-06-01" },
  },
])("starts the workflow with $args", async ({ args, input }) => {
  await main(args, { startTask });
  expect(startTask).toHaveBeenCalledExactlyOnceWith("niryat-worker/monthlyClose", [input]);
  expect(console.log).toHaveBeenCalledExactlyOnceWith('{"taskRunId":"task-run-test"}');
  expect(process.exitCode).toBe(0);
});

it.each([undefined, "", " "])("requires a nonempty RENDER_API_KEY (%j)", async (key) => {
  vi.stubEnv("RENDER_API_KEY", key);
  await main([], { startTask });
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith("Invalid environment: RENDER_API_KEY.");
  expect(startTask).not.toHaveBeenCalled();
});

it("allows local development without a key", async () => {
  vi.stubEnv("RENDER_API_KEY", undefined);
  vi.stubEnv("RENDER_USE_LOCAL_DEV", "true");
  await main([], { startTask });
  expect(startTask).toHaveBeenCalledExactlyOnceWith("niryat-worker/monthlyClose", [{}]);
  expect(process.exitCode).toBe(0);
});

it.each(["TRUE", "1", "false"])("does not accept %s as the local-dev exemption", async (value) => {
  vi.stubEnv("RENDER_API_KEY", undefined);
  vi.stubEnv("RENDER_USE_LOCAL_DEV", value);
  await main([], { startTask });
  expect(process.exitCode).toBe(1);
  expect(startTask).not.toHaveBeenCalled();
});

it.each([
  { args: ["--month", "2026-13"] },
  { args: ["--as-of", "2027-02-29"] },
  { args: ["--userId", "private-value"] },
  { args: ["--month"] },
  { args: ["private-value"] },
])("rejects invalid arguments $args without starting a task", async ({ args }) => {
  await main(args, { startTask });
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith("Invalid arguments: month, as-of.");
  expect(startTask).not.toHaveBeenCalled();
});

it("reports a trigger failure without logging service details", async () => {
  startTask.mockRejectedValue(new Error("private service detail test-key"));
  await main([], { startTask });
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith("Monthly close trigger failed");
  expect(console.log).not.toHaveBeenCalled();
});

it.each([{}, { taskRunId: "" }, { taskRunId: 123 }])(
  "validates the SDK result %j",
  async (result) => {
    startTask.mockResolvedValue(result);
    await main([], { startTask });
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Monthly close trigger failed");
    expect(console.log).not.toHaveBeenCalled();
  },
);
