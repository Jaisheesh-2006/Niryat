import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { type AgentTool, createClaudeRunner } from "./claude";
import {
  type CloseAgentInput,
  type CloseDrafts,
  closeAgentTools,
  runCloseAgent,
  type ToolLog,
} from "./close-agent";

const fake = vi.hoisted(() => ({
  messages: [] as unknown[],
  throws: false,
  before: async () => {},
  query: vi.fn<(input: Parameters<typeof query>[0]) => AsyncGenerator<unknown>>(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  query: fake.query.mockImplementation(async function* () {
    await fake.before();
    for (const message of fake.messages) yield message;
    if (fake.throws) throw new Error("private SDK output");
  }),
}));

beforeEach(() => {
  fake.messages = [];
  fake.throws = false;
  fake.before = async () => {};
  fake.query.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
const input = { system: "System", prompt: "Prompt", tools: [], maxTurns: 20, maxBudgetUsd: 0.75 };
function runner() {
  return createClaudeRunner({ apiKey: "fake-key", model: "fake-model", query });
}
const valid = { type: "result", subtype: "success", is_error: false, total_cost_usd: 0.0123 };

it("configures exact tools, permissions and an isolated environment", async () => {
  vi.stubEnv("DATABASE_URL", "private-db");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "private-secret");
  vi.stubEnv("ENCRYPTION_KEY", "private-key");
  fake.messages = [valid];
  const tool: AgentTool = {
    name: "example",
    description: "Example",
    shape: { id: z.string() },
    handler: async () => ({ text: "Draft saved." }),
  };
  expect(await runner().run({ ...input, tools: [tool] })).toEqual({
    status: "used",
    costUsd: "0.0123",
  });
  const call = z
    .object({
      prompt: z.string(),
      options: z.object({
        tools: z.array(z.string()),
        allowedTools: z.array(z.string()),
        disallowedTools: z.array(z.string()),
        settingSources: z.array(z.string()),
        strictMcpConfig: z.boolean(),
        maxTurns: z.number(),
        maxBudgetUsd: z.number(),
        model: z.string(),
        env: z.record(z.string(), z.string()),
        cwd: z.string(),
        persistSession: z.boolean(),
        permissionMode: z.string(),
        mcpServers: z.record(z.string(), z.unknown()),
      }),
    })
    .parse(fake.query.mock.calls[0]?.[0]);
  expect(call.options).toMatchObject({
    tools: [],
    allowedTools: ["mcp__niryat__example"],
    settingSources: [],
    strictMcpConfig: true,
    maxTurns: 20,
    maxBudgetUsd: 0.75,
    model: "fake-model",
    cwd: tmpdir(),
    persistSession: false,
    permissionMode: "dontAsk",
  });
  expect(call.options.disallowedTools).toEqual(
    expect.arrayContaining([
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Agent",
      "Task",
      "WebFetch",
      "WebSearch",
    ]),
  );
  expect(Object.keys(call.options.mcpServers)).toEqual(["niryat"]);
  expect(call.options.env.ANTHROPIC_API_KEY).toBe("fake-key");
  expect(
    Object.keys(call.options.env).every((key) =>
      ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "ANTHROPIC_API_KEY"].includes(
        key,
      ),
    ),
  ).toBe(true);
  expect(JSON.stringify(call.options.env)).not.toMatch(
    /private|DATABASE_URL|PAYPAL_CLIENT_SECRET|ENCRYPTION_KEY/,
  );
  const options = fake.query.mock.calls[0]?.[0]?.options;
  const guard = options?.canUseTool;
  if (!guard) throw new Error("Missing permission guard");
  const context = {
    signal: new AbortController().signal,
    toolUseID: "fake-tool-use",
    requestId: "fake-request",
  };
  expect(await guard("Bash", {}, context)).toEqual({
    behavior: "deny",
    message: "Tool not allowed",
  });
  expect(await guard("mcp__other__example", {}, context)).toEqual({
    behavior: "deny",
    message: "Tool not allowed",
  });
  expect(await guard("mcp__niryat__example", { id: "known" }, context)).toEqual({
    behavior: "allow",
    updatedInput: { id: "known" },
  });
});

it.each([
  { message: valid, status: "used", costUsd: "0.0123" },
  { message: { ...valid, is_error: true }, status: "failed", costUsd: "0.0123" },
  {
    message: { ...valid, subtype: "error_max_budget_usd", is_error: true },
    status: "budget_exhausted",
    costUsd: "0.0123",
  },
  {
    message: { ...valid, subtype: "error_max_turns", is_error: true },
    status: "failed",
    costUsd: "0.0123",
  },
  {
    message: { ...valid, subtype: "error_during_execution", is_error: true },
    status: "failed",
    costUsd: "0.0123",
  },
  { message: { ...valid, is_error: undefined }, status: "failed", costUsd: "0.7500" },
  { message: { ...valid, is_error: "false" }, status: "failed", costUsd: "0.7500" },
  { message: { ...valid, total_cost_usd: -1 }, status: "failed", costUsd: "0.7500" },
  { message: { ...valid, total_cost_usd: Number.NaN }, status: "failed", costUsd: "0.7500" },
  { message: { ...valid, total_cost_usd: "0.0123" }, status: "failed", costUsd: "0.7500" },
  { message: { ...valid, subtype: "unexpected" }, status: "failed", costUsd: "0.7500" },
])("maps parsed SDK results to $status at $costUsd", async ({ message, status, costUsd }) => {
  fake.messages = [message];
  expect(await runner().run(input)).toEqual({ status, costUsd });
});

it.each([
  { messages: [valid], status: "failed", costUsd: "0.0123" },
  { messages: [{ ...valid, is_error: true }], status: "failed", costUsd: "0.0123" },
  {
    messages: [{ ...valid, subtype: "error_max_budget_usd", is_error: true }],
    status: "budget_exhausted",
    costUsd: "0.0123",
  },
  { messages: [], status: "failed", costUsd: "0.7500" },
])("preserves reported cost after an iterator throw", async ({ messages, status, costUsd }) => {
  fake.messages = messages;
  fake.throws = true;
  expect(await runner().run(input)).toEqual({ status, costUsd });
});

it("does not inspect the SDK's free-text error result", async () => {
  fake.messages = [
    {
      ...valid,
      is_error: true,
      get result() {
        throw new Error("Must not read model text");
      },
    },
  ];
  expect(await runner().run(input)).toEqual({ status: "failed", costUsd: "0.0123" });
});

it.each([
  { logFails: false, sdkResult: valid, status: "used" },
  { logFails: true, sdkResult: valid, status: "failed" },
  {
    logFails: true,
    sdkResult: { ...valid, subtype: "error_max_budget_usd", is_error: true },
    status: "budget_exhausted",
  },
])(
  "audits MCP calls and returns $status when the audit log fails: $logFails",
  async ({ logFails, sdkResult, status }) => {
    const invoiceId = "11111111-1111-4111-8111-111111111111";
    const input: CloseAgentInput = {
      kind: "reminders",
      known: {
        candidates: [{ invoiceId, stage: 60 }],
        invoiceIds: new Set([invoiceId]),
        clientIds: new Set(),
        disputeIds: new Set(),
        firaLineIds: new Set(),
        paypalInvoiceIds: new Set(),
        paypalTxnIds: new Set(),
        month: "2026-10",
      },
      data: {
        overview: async () => ({}),
        openInvoices: async () => [],
        clientHistory: async () => null,
        firaIssues: async () => [],
        openDisputes: async () => [],
      },
    };
    const drafts: CloseDrafts = { reminders: new Map(), tasks: [], summary: null };
    const log = vi.fn<ToolLog>(async ({ ok }) => {
      if (logFails && ok) throw new Error("private audit failure details");
    });
    const protocolErrors: string[] = [];
    fake.messages = [sdkResult];
    fake.before = async () => {
      const config = fake.query.mock.calls[0]?.[0].options?.mcpServers?.niryat;
      if (config?.type !== "sdk") throw new Error("Missing SDK server");
      const server = config.instance.server;
      let response: unknown;
      const transport: Parameters<typeof server.connect>[0] = {
        start: async () => {},
        close: async () => {},
        send: async (message) => {
          response = message;
        },
      };
      await server.connect(transport);
      try {
        transport.onmessage?.({ jsonrpc: "2.0", id: 1, method: "tools/list" });
        await vi.waitFor(() => expect(response).toBeDefined());
        const listing = z
          .object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) })
          .parse(response);
        expect(listing.result.tools.map(({ name }) => name).sort()).toEqual([
          "get_client_history",
          "list_open_disputes",
          "list_open_invoices",
          "propose_reminder",
        ]);
        const valid = {
          invoiceId,
          stage: 60,
          advice: "send",
          reason: "Review the outstanding payment.",
        };
        for (const [index, args] of [
          { ...valid, reason: "tiny" },
          { ...valid, note: "private@example.com" },
          valid,
        ].entries()) {
          response = undefined;
          transport.onmessage?.({
            jsonrpc: "2.0",
            id: index + 2,
            method: "tools/call",
            params: { name: "propose_reminder", arguments: args },
          });
          await vi.waitFor(() => expect(response).toBeDefined());
          if (logFails && index === 2) {
            const reply = z.object({ error: z.object({ message: z.string() }) }).parse(response);
            protocolErrors.push(reply.error.message);
          } else {
            const reply = z
              .object({
                result: z.object({
                  content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
                  isError: z.boolean().optional(),
                }),
              })
              .parse(response);
            expect(reply.result.content[0]?.text).toBe(
              index < 2 ? "Rejected: invalid_reason" : "Draft saved.",
            );
          }
          expect(log).toHaveBeenCalledTimes(index + 1);
          expect(drafts.reminders.size).toBe(index < 2 ? 0 : 1);
        }
        expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.com");
      } finally {
        await server.close();
      }
    };
    const result = await runner().run({
      system: "System",
      prompt: "Prompt",
      tools: closeAgentTools(input, drafts, log),
      maxTurns: 8,
      maxBudgetUsd: 0.75,
    });
    expect(result).toEqual({ status, costUsd: "0.0123" });
    expect(drafts.reminders.size).toBe(1);
    expect(log).toHaveBeenCalledTimes(3);
    expect(protocolErrors).toEqual(logFails ? ["tool_handler_failed"] : []);
  },
);

it.each([false, true])(
  "retains accepted reminder, task and summary after an SDK error (throw: %s)",
  async (throws) => {
    const invoiceId = "11111111-1111-4111-8111-111111111111";
    const reason = "Review the outstanding payment.";
    const source: CloseAgentInput = {
      kind: "monthly_close",
      known: {
        candidates: [{ invoiceId, stage: 60 }],
        invoiceIds: new Set([invoiceId]),
        clientIds: new Set(),
        disputeIds: new Set(),
        firaLineIds: new Set(),
        paypalInvoiceIds: new Set(),
        paypalTxnIds: new Set(),
        month: "2026-10",
      },
      data: {
        overview: async () => ({}),
        openInvoices: async () => [],
        clientHistory: async () => null,
        firaIssues: async () => [],
        openDisputes: async () => [],
      },
    };
    const actualRunner = runner();
    const run = vi.fn(async (args: Parameters<typeof actualRunner.run>[0]) => {
      fake.before = async () => {
        for (const [name, draft] of [
          ["propose_reminder", { invoiceId, stage: 60, advice: "hold", reason }],
          ["suggest_task", { kind: "follow_up_client", entityId: invoiceId, reason }],
          [
            "write_summary",
            { note: reason, focus: [{ entityType: "invoice", entityId: invoiceId, reason }] },
          ],
        ] as const) {
          const tool = args.tools.find((tool) => tool.name === name);
          if (!tool) throw new Error("Missing test tool");
          await tool.handler(draft);
        }
      };
      return actualRunner.run(args);
    });
    fake.messages = [{ ...valid, is_error: true }];
    fake.throws = throws;
    const result = await runCloseAgent({ run }, source, {
      maxBudgetUsd: 0.75,
      log: async () => {},
    });
    expect(result).toMatchObject({ status: "failed", costUsd: "0.0123" });
    expect(result.drafts.reminders.size).toBe(1);
    expect(result.drafts.tasks).toHaveLength(1);
    expect(result.drafts.summary?.note).toBe(reason);
  },
);

it("confines package environment reads to createClaudeRunner", () => {
  for (const file of readdirSync(new URL(".", import.meta.url)).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  )) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8");
    if (file === "claude.ts") {
      expect(code.indexOf("process.env")).toBeGreaterThan(
        code.indexOf("function createClaudeRunner"),
      );
      expect(code).not.toContain("...process.env");
    } else expect(code).not.toMatch(/process\.env/);
  }
});
