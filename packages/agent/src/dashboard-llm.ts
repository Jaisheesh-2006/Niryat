import {
  DASHBOARD_FIGURE_NOTE,
  type DashboardTurnRequest,
  type DashboardTurnResponse,
  dashboardTurnResponseSchema,
} from "@niryat/shared";
import { z } from "zod";

export interface DashboardLlm {
  turn(
    request: DashboardTurnRequest,
    options: { instructions: string; maxTokens: number },
  ): Promise<DashboardTurnResponse>;
}

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

const argumentsSchema = z.record(z.string(), z.unknown());
const replySchema = z.object({
  id: z.string(),
  model: z.string(),
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({
        type: z.literal("tool_use"),
        id: z.string(),
        name: z.string(),
        input: argumentsSchema,
      }),
    ]),
  ),
  stop_reason: z.enum(["end_turn", "stop_sequence", "tool_use", "max_tokens"]),
  usage: z.object({ input_tokens: z.int().nonnegative(), output_tokens: z.int().nonnegative() }),
});

// Pure AG Studio → Messages API translation (current-phase-plan §4.6).
function toMessagesBody(
  request: DashboardTurnRequest,
  options: { instructions: string; maxTokens: number; model: string },
) {
  const system = [options.instructions, request.instructions ?? ""];
  const messages: { role: "user" | "assistant"; content: Block[] }[] = [];
  const push = (role: "user" | "assistant", block: Block) => {
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(block);
    else messages.push({ role, content: [block] });
  };
  const explicit = new Set(
    request.input.flatMap((item) => (item.type === "function_call_output" ? [item.callId] : [])),
  );
  for (const item of request.input) {
    if (item.type === "message") {
      const texts = item.content.map((part) => part.text);
      if (item.role === "system") system.push(...texts);
      else for (const text of texts) push(item.role, { type: "text", text });
    } else if (item.type === "function_call") {
      push("assistant", {
        type: "tool_use",
        id: item.callId,
        name: item.name,
        input: argumentsSchema.parse(JSON.parse(item.arguments)),
      });
      // An inline result counts only when no explicit result item answers the same call.
      if (item.result !== undefined && !explicit.has(item.callId))
        push("user", { type: "tool_result", tool_use_id: item.callId, content: item.result });
    } else push("user", { type: "tool_result", tool_use_id: item.callId, content: item.output });
  }
  const tools = request.tools ?? [];
  const choice = request.toolChoice;
  return {
    model: options.model,
    max_tokens: options.maxTokens,
    system: system.filter((text) => text.length > 0).join("\n\n"),
    messages,
    ...(tools.length > 0
      ? {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            // A tool without parameters arrives as {}; Anthropic requires an object schema.
            input_schema: { type: "object", ...tool.parameters },
          })),
          ...(choice === undefined
            ? {}
            : {
                tool_choice:
                  typeof choice === "object"
                    ? { type: "tool", name: choice.name }
                    : { type: choice === "required" ? "any" : choice },
              }),
        }
      : {}),
  };
}

export function createDashboardLlm(
  config: { apiKey: string; model: string },
  fetcher: typeof fetch,
): DashboardLlm {
  const parsed = z
    .object({ apiKey: z.string().min(1), model: z.string().min(1) })
    .safeParse(config);
  if (!parsed.success) throw new Error("Invalid Claude configuration keys");
  const { apiKey, model } = parsed.data;
  return {
    async turn(request, options) {
      const response = await fetcher("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2026-10-21",
        },
        body: JSON.stringify(toMessagesBody(request, { ...options, model })),
      });
      // Provider error bodies are never read or relayed.
      if (!response.ok) throw new Error(`dashboard_llm_http_${response.status}`);
      const reply = replySchema.safeParse(await response.json().catch(() => undefined));
      if (!reply.success) throw new Error("dashboard_llm_reply_invalid");
      const { id, content, stop_reason, usage } = reply.data;
      const truncated = stop_reason === "max_tokens";
      return dashboardTurnResponseSchema.parse({
        id,
        createdAt: Date.now(),
        output: content.flatMap((block, index): unknown[] =>
          block.type === "text"
            ? [
                {
                  id: `${id}-${index}`,
                  kind: "output",
                  type: "message",
                  role: "assistant",
                  // Phase 5 D12: figures belong in widgets, never in Claude's prose.
                  content: [
                    {
                      type: "text",
                      text: /\p{Nd}/u.test(block.text) ? DASHBOARD_FIGURE_NOTE : block.text,
                      annotations: [],
                    },
                  ],
                  status: "completed",
                },
              ]
            : truncated
              ? [] // A truncated call may be incomplete, so it is never handed to AG Studio to run.
              : [
                  {
                    id: `${id}-${index}`,
                    kind: "output",
                    type: "function_call",
                    callId: block.id,
                    name: block.name,
                    arguments: JSON.stringify(block.input),
                    status: "completed",
                  },
                ],
        ),
        status: truncated ? "incomplete" : "completed",
        model: reply.data.model,
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
        },
        ...(truncated ? { incompleteDetails: { reason: "max_output_tokens" } } : {}),
      });
    },
  };
}
