import type { AgAiEvent, AgLlmRequest } from "ag-studio";
import { describe, expect, it, vi } from "vitest";
import { createDashboardAdapter, DASHBOARD_PROMPT_STARTERS } from "./dashboard-adapter";

const request: AgLlmRequest = {
  input: [
    {
      id: "u1",
      kind: "input",
      type: "message",
      role: "user",
      content: [{ type: "text", text: "Show my PayPal fees by client this year" }],
      status: "completed",
    },
  ],
  responseFormat: { type: "text" },
};
const turn = {
  id: "msg_1",
  createdAt: 1,
  output: [
    {
      id: "msg_1-0",
      kind: "output",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Here is your chart.", annotations: [] }],
      status: "completed",
    },
    {
      id: "msg_1-1",
      kind: "output",
      type: "function_call",
      callId: "toolu_1",
      name: "add_widget",
      arguments: '{"title":"Fees"}',
      status: "completed",
    },
  ],
  status: "completed",
};
const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
async function events(stream: AsyncIterable<AgAiEvent>) {
  const seen: AgAiEvent[] = [];
  for await (const event of stream) seen.push(event);
  return seen;
}

describe("createDashboardAdapter", () => {
  it("posts the turn to the API proxy, emits AG events and resolves complete", async () => {
    const fetcher = respond(turn);
    const signal = new AbortController().signal;
    const handler = createDashboardAdapter(fetcher).executeTurn(request, { signal });
    expect(await events(handler.stream)).toEqual([
      {
        type: "TEXT_MESSAGE_CHUNK",
        messageId: "msg_1-0",
        role: "assistant",
        delta: "Here is your chart.",
      },
      { type: "TOOL_CALL_START", toolCallId: "toolu_1", toolCallName: "add_widget" },
      { type: "TOOL_CALL_ARGS", toolCallId: "toolu_1", delta: '{"title":"Fees"}' },
      { type: "TOOL_CALL_END", toolCallId: "toolu_1" },
    ]);
    expect(await handler.complete).toEqual(turn);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/dashboard/turn");
    expect(init).toMatchObject({ method: "POST", signal });
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it.each([
    [
      402,
      "ai_budget_exhausted",
      "The monthly AI budget is used up. The dashboard still works without questions.",
    ],
    [409, "dashboard_busy", "Claude is still answering your previous question."],
    [503, "ai_unavailable", "Questions are not available in this deployment."],
    [502, "ai_failed", "Claude could not answer. Try rephrasing the question."],
    [413, "too_large", "Claude could not answer. Try rephrasing the question."],
  ])(
    "turns HTTP %s into a failed response with the exact message",
    async (status, code, message) => {
      const handler = createDashboardAdapter(respond({ error: code }, status)).executeTurn(request);
      expect(await events(handler.stream)).toEqual([]);
      expect(await handler.complete).toMatchObject({
        status: "failed",
        output: [],
        error: { code, message },
      });
    },
  );

  it("fails a malformed success body instead of passing it to AG Studio", async () => {
    const handler = createDashboardAdapter(respond({ ...turn, output: "x" })).executeTurn(request);
    expect(await handler.complete).toMatchObject({ status: "failed", output: [] });
  });

  it("forwards abort to fetch and resolves as cancelled", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const handler = createDashboardAdapter(fetcher).executeTurn(request, {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(await handler.complete).toMatchObject({ status: "cancelled", output: [] });
    expect(await events(handler.stream)).toEqual([]);
  });

  it("offers the three demo questions as prompt starters", () => {
    expect(DASHBOARD_PROMPT_STARTERS.map(({ prompt }) => prompt)).toEqual([
      "Show my PayPal fees by client this year",
      "Which unpaid invoices are closest to their RBI deadline?",
      "How much did I receive each month this year, by currency?",
    ]);
  });
});
