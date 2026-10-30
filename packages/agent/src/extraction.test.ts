import { extractionFieldNames } from "@niryat/shared";
import { expect, it, vi } from "vitest";
import { type ClaudeRunner, createClaudeRunner } from "./claude";
import { extractionTool, runExtraction } from "./extraction";

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  query: async function* () {
    yield { type: "result", subtype: "success", is_error: true, total_cost_usd: 0.0123 };
  },
}));

it("retains a draft and cost but fails SDK success with is_error true", async () => {
  const sdk = createClaudeRunner({ apiKey: "fake-key", model: "fake-model" });
  const runner: ClaudeRunner = {
    run: async (input) => {
      await input.tools[0]?.handler(draft());
      return sdk.run({ ...input, tools: [] });
    },
  };
  expect(await runExtraction(runner, text, { maxBudgetUsd: 0.1, log: async () => {} })).toEqual({
    status: "failed",
    costUsd: "0.0123",
    raw: draft(),
  });
});

const text = "Invoice private-client@example.com USD 1,500 for dashboard work.";
function draft() {
  return Object.fromEntries(
    extractionFieldNames.map((name) => [name, { value: null, source: null }]),
  );
}

it("accepts one submission, rejects repeated or malformed input, and logs field names only", async () => {
  const log = vi.fn(async () => {});
  const sink = { result: null };
  const tool = extractionTool(text, sink, log);
  const input = { ...draft(), clientEmail: { value: "private-client@example.com", source: text } };
  expect(await tool.handler(text)).toEqual({ text: "Rejected: invalid_input", isError: true });
  expect(await tool.handler({ ...input, unexpected: text })).toEqual({
    text: "Rejected: invalid_input",
    isError: true,
  });
  expect(await tool.handler(input)).toEqual({ text: "Extraction submitted." });
  expect(sink.result).toEqual(input);
  expect(await tool.handler(input)).toEqual({ text: "Rejected: already_submitted", isError: true });
  expect(log).toHaveBeenCalledTimes(4);
  expect(log.mock.calls[2]).toEqual([
    {
      tool: "submit_extraction",
      input: { fields: ["clientEmail"] },
      output: { fields: ["clientEmail"] },
      ok: true,
    },
  ]);
  expect(JSON.stringify(log.mock.calls)).not.toContain(text);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-client@example.com");
});

it.each(["used", "failed", "budget_exhausted"] as const)(
  "retains the draft and cost with runner status %s",
  async (status) => {
    const run = vi.fn<ClaudeRunner["run"]>(async ({ tools }) => {
      const tool = tools[0];
      if (!tool) throw new Error("Missing extraction tool");
      await tool.handler(draft());
      return { status, costUsd: "0.0123" };
    });
    const result = await runExtraction({ run }, text, { maxBudgetUsd: 0.05, log: async () => {} });
    expect(result).toEqual({ status, costUsd: "0.0123", raw: draft() });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTurns: 3,
        maxBudgetUsd: 0.05,
        prompt: JSON.stringify({ text }),
      }),
    );
    expect(run.mock.calls[0]?.[0].tools.map((tool) => tool.name)).toEqual(["submit_extraction"]);
  },
);
