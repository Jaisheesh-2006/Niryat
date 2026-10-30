import { tmpdir } from "node:os";
import {
  BUILTIN_TOOL_NAMES,
  createSdkMcpServer,
  LEGACY_TOOL_NAME_ALIASES,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export interface AgentTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler: (args: unknown) => Promise<{ text: string; isError?: boolean }>;
}
export interface ClaudeRunner {
  run(input: {
    system: string;
    prompt: string;
    tools: readonly AgentTool[];
    maxTurns: number;
    maxBudgetUsd: number;
  }): Promise<{ status: "used" | "failed" | "budget_exhausted"; costUsd: string }>;
}

const sdkResult = z.object({
  type: z.literal("result"),
  subtype: z.enum([
    "success",
    "error_during_execution",
    "error_max_turns",
    "error_max_budget_usd",
    "error_max_structured_output_retries",
  ]),
  is_error: z.boolean(),
  total_cost_usd: z.number().finite().nonnegative(),
});

export function createClaudeRunner(config: {
  apiKey: string;
  model: string;
  query?: typeof query;
}): ClaudeRunner {
  const parsed = z
    .object({ apiKey: z.string().min(1), model: z.string().min(1) })
    .safeParse(config);
  if (!parsed.success) throw new Error("Invalid Claude configuration keys");
  const env: Record<string, string> = { ANTHROPIC_API_KEY: parsed.data.apiKey };
  for (const key of ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP"]) {
    const value = z.string().optional().parse(process.env[key]);
    if (value !== undefined) env[key] = value;
  }
  const runQuery = config.query ?? query;
  return {
    async run(input) {
      const { maxBudgetUsd, maxTurns, system, prompt } = z
        .object({
          maxBudgetUsd: z.number().finite().nonnegative(),
          maxTurns: z.number().int().positive(),
          system: z.string(),
          prompt: z.string(),
        })
        .parse(input);
      const allowedTools = input.tools.map(({ name }) => `mcp__niryat__${name}`);
      let result: z.infer<typeof sdkResult> | undefined;
      let failed = false;
      try {
        const handleTool = async (definition: AgentTool, args: unknown) => {
          try {
            const result = await definition.handler(args);
            return {
              content: [{ type: "text" as const, text: result.text }],
              ...(result.isError ? { isError: true } : {}),
            };
          } catch {
            failed = true;
            throw new Error("tool_handler_failed");
          }
        };
        const server = createSdkMcpServer({
          name: "niryat",
          tools: input.tools.map((definition) =>
            tool(definition.name, definition.description, definition.shape, (args) =>
              handleTool(definition, args),
            ),
          ),
        });
        // Validate original arguments in Niryat so SDK stripping/rejection cannot bypass the audit log.
        server.instance.server.setRequestHandler(
          z.object({
            method: z.literal("tools/call"),
            params: z.object({ name: z.string(), arguments: z.unknown().optional() }),
          }),
          async ({ params }) => {
            const definition = input.tools.find(({ name }) => name === params.name);
            if (!definition)
              return {
                content: [{ type: "text", text: "Rejected: tool_not_allowed" }],
                isError: true,
              };
            return handleTool(definition, params.arguments === undefined ? {} : params.arguments);
          },
        );
        for await (const message of runQuery({
          prompt,
          options: {
            systemPrompt: system,
            tools: [],
            disallowedTools: [...BUILTIN_TOOL_NAMES, ...Object.keys(LEGACY_TOOL_NAME_ALIASES)],
            allowedTools,
            mcpServers: { niryat: server },
            settingSources: [],
            strictMcpConfig: true,
            permissionMode: "dontAsk",
            persistSession: false,
            cwd: tmpdir(),
            maxTurns,
            maxBudgetUsd,
            model: parsed.data.model,
            env,
            canUseTool: async (name, args) =>
              allowedTools.includes(name)
                ? { behavior: "allow", updatedInput: args }
                : { behavior: "deny", message: "Tool not allowed" },
          },
        })) {
          const envelope = z.object({ type: z.string() }).safeParse(message);
          if (!envelope.success) {
            failed = true;
            continue;
          }
          if (envelope.data.type !== "result") continue;
          const parsedResult = sdkResult.safeParse(message);
          if (parsedResult.success) result = parsedResult.data;
          else failed = true;
        }
      } catch {
        failed = true;
      }
      const status =
        result?.subtype === "error_max_budget_usd"
          ? "budget_exhausted"
          : !failed && result?.subtype === "success" && !result.is_error
            ? "used"
            : "failed";
      return { status, costUsd: (result?.total_cost_usd ?? maxBudgetUsd).toFixed(4) };
    },
  };
}
