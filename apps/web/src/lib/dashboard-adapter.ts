import { dashboardTurnResponseSchema } from "@niryat/shared";
import type { AgAiEvent, AgLlmAdapter, AgLlmResponse } from "ag-studio";
import { z } from "zod";

export const DASHBOARD_PROMPT_STARTERS = [
  "Show my PayPal fees by client this year",
  "Which unpaid invoices are closest to their RBI deadline?",
  "How much did I receive each month this year, by currency?",
].map((prompt) => ({ label: prompt, prompt }));

const errorMessages: Record<string, string> = {
  ai_unavailable: "Questions are not available in this deployment.",
  ai_budget_exhausted:
    "The monthly AI budget is used up. The dashboard still works without questions.",
  dashboard_busy: "Claude is still answering your previous question.",
};
const FALLBACK_ERROR = "Claude could not answer. Try rephrasing the question.";

function ended(status: "failed" | "cancelled", code: string): AgLlmResponse {
  const message = errorMessages[code] ?? FALLBACK_ERROR;
  return {
    id: `dashboard-${status}`,
    createdAt: Date.now(),
    output: [],
    status,
    error: { code, message },
  };
}

function* eventsFor(response: AgLlmResponse): Generator<AgAiEvent> {
  for (const item of response.output) {
    if (item.type === "message") {
      const delta = item.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      yield { type: "TEXT_MESSAGE_CHUNK", messageId: item.id, role: "assistant", delta };
    } else if (item.type === "function_call") {
      yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name };
      yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments };
      yield { type: "TOOL_CALL_END", toolCallId: item.callId };
    }
  }
}

// Claude is reached only through Niryat's API proxy, so the key never reaches the browser (D11).
export function createDashboardAdapter(fetcher: typeof fetch): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      const complete = (async (): Promise<AgLlmResponse> => {
        try {
          const response = await fetcher("/api/dashboard/turn", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            ...(options?.signal ? { signal: options.signal } : {}),
          });
          const body: unknown = await response.json().catch(() => undefined);
          if (response.ok) {
            const parsed = dashboardTurnResponseSchema.safeParse(body);
            return parsed.success ? parsed.data : ended("failed", "invalid_response");
          }
          const error = z.object({ error: z.string() }).safeParse(body);
          return ended("failed", error.success ? error.data.error : "ai_failed");
        } catch {
          return ended(options?.signal?.aborted ? "cancelled" : "failed", "request_failed");
        }
      })();
      // shortcut: the API replies in one piece, so events are replayed after it arrives; stream server-side if latency matters.
      return {
        complete,
        stream: {
          async *[Symbol.asyncIterator]() {
            yield* eventsFor(await complete);
          },
        },
      };
    },
  };
}
