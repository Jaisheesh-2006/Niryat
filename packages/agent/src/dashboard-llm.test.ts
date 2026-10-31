import { DASHBOARD_FIGURE_NOTE, dashboardTurnRequestSchema } from "@niryat/shared";
import { describe, expect, it, vi } from "vitest";
import { createDashboardLlm } from "./dashboard-llm";

const request = dashboardTurnRequestSchema.parse({
  input: [
    {
      id: "s1",
      kind: "input",
      type: "message",
      role: "system",
      content: [{ type: "text", text: "Input system" }],
      status: "completed",
    },
    {
      id: "u1",
      kind: "input",
      type: "message",
      role: "user",
      content: [{ type: "text", text: "Show my PayPal fees by client this year" }],
      status: "completed",
    },
    {
      id: "a1",
      kind: "output",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Looking.", annotations: [] }],
      status: "completed",
    },
    {
      id: "c1",
      kind: "output",
      type: "function_call",
      callId: "toolu_1",
      name: "view_schema",
      arguments: "{}",
      status: "completed",
      result: "inline result",
    },
    { type: "function_call_output", callId: "toolu_1", output: "explicit", status: "completed" },
    {
      id: "c2",
      kind: "output",
      type: "function_call",
      callId: "toolu_2",
      name: "execute_query",
      arguments: '{"limit":5}',
      result: "inline only",
    },
  ],
  instructions: "AG instructions",
  tools: [
    { name: "view_schema", description: "Schema", parameters: {} },
    {
      name: "execute_query",
      description: "Query",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
      kind: "client",
    },
  ],
  toolChoice: "required",
  responseFormat: { type: "text" },
  model: { id: "browser-picked-model" },
});
const options = { instructions: "Niryat instructions", maxTokens: 2048 };

function reply(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}
const usage = { input_tokens: 10, output_tokens: 4 };
const llm = (fetcher: typeof fetch) =>
  createDashboardLlm({ apiKey: "sk-secret-key", model: "configured-model" }, fetcher);

function sent(fetcher: ReturnType<typeof reply>) {
  const [url, init] = fetcher.mock.calls[0] ?? [];
  return { url, init, body: JSON.parse(String(init?.body)) };
}

describe("createDashboardLlm", () => {
  it("translates AG items, tools and choices into one Messages API request", async () => {
    const fetcher = reply({ id: "msg_1", model: "m", content: [], stop_reason: "end_turn", usage });
    await llm(fetcher).turn(request, options);
    const { url, init, body } = sent(fetcher);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "sk-secret-key",
      "anthropic-version": "2026-10-21",
    });
    expect(body).toEqual({
      model: "configured-model",
      max_tokens: 2048,
      system: "Niryat instructions\n\nAG instructions\n\nInput system",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Show my PayPal fees by client this year" }],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Looking." },
            { type: "tool_use", id: "toolu_1", name: "view_schema", input: {} },
          ],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "explicit" }],
        },
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "toolu_2", name: "execute_query", input: { limit: 5 } },
          ],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_2", content: "inline only" }],
        },
      ],
      tools: [
        { name: "view_schema", description: "Schema", input_schema: { type: "object" } },
        {
          name: "execute_query",
          description: "Query",
          input_schema: { type: "object", properties: { limit: { type: "number" } } },
        },
      ],
      tool_choice: { type: "any" },
    });
    expect(JSON.stringify(body)).not.toContain("sk-secret-key");
  });

  it.each([
    [{ name: "execute_query" }, { type: "tool", name: "execute_query" }],
    ["auto", { type: "auto" }],
    ["none", { type: "none" }],
  ] as const)("maps tool choice %j", async (toolChoice, expected) => {
    const fetcher = reply({ id: "msg_1", model: "m", content: [], stop_reason: "end_turn", usage });
    await llm(fetcher).turn({ ...request, toolChoice }, options);
    expect(sent(fetcher).body.tool_choice).toEqual(expected);
  });

  it("returns AG output items, replacing prose with digits but not tool arguments", async () => {
    const fetcher = reply({
      id: "msg_2",
      model: "claude-x",
      content: [
        { type: "text", text: "You earned USD 1,500 in October." },
        { type: "text", text: "Here is a chart." },
        { type: "text", text: "Devanagari digit ३" },
        { type: "tool_use", id: "toolu_9", name: "add_widget", input: { title: "Fees", top: 10 } },
      ],
      stop_reason: "tool_use",
      usage,
    });
    expect(await llm(fetcher).turn(request, options)).toEqual({
      id: "msg_2",
      createdAt: expect.any(Number),
      output: [
        {
          id: "msg_2-0",
          kind: "output",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: DASHBOARD_FIGURE_NOTE, annotations: [] }],
          status: "completed",
        },
        {
          id: "msg_2-1",
          kind: "output",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Here is a chart.", annotations: [] }],
          status: "completed",
        },
        {
          id: "msg_2-2",
          kind: "output",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: DASHBOARD_FIGURE_NOTE, annotations: [] }],
          status: "completed",
        },
        {
          id: "msg_2-3",
          kind: "output",
          type: "function_call",
          callId: "toolu_9",
          name: "add_widget",
          arguments: '{"title":"Fees","top":10}',
          status: "completed",
        },
      ],
      status: "completed",
      model: "claude-x",
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
  });

  it("marks a truncated reply incomplete and drops its possibly partial tool call", async () => {
    const fetcher = reply({
      id: "msg_3",
      model: "m",
      content: [
        { type: "text", text: "Building it." },
        { type: "tool_use", id: "toolu_3", name: "add_widget", input: {} },
      ],
      stop_reason: "max_tokens",
      usage,
    });
    const response = await llm(fetcher).turn(request, options);
    expect(response.status).toBe("incomplete");
    expect(response.incompleteDetails).toEqual({ reason: "max_output_tokens" });
    expect(response.output.map((item) => item.type)).toEqual(["message"]);
  });

  it.each([
    ["an HTTP error", reply({ error: { message: "provider detail sk-secret-key" } }, 500)],
    [
      "an unexpected stop",
      reply({ id: "x", model: "m", content: [], stop_reason: "refusal", usage }),
    ],
    [
      "an unknown block",
      reply({
        id: "x",
        model: "m",
        content: [{ type: "thinking" }],
        stop_reason: "end_turn",
        usage,
      }),
    ],
    ["a non-JSON body", vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 }))],
  ])("throws a coded error without provider text on %s", async (_label, fetcher) => {
    const error = await llm(fetcher)
      .turn(request, options)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/dashboard_llm_/);
    expect(String(error)).not.toMatch(/provider detail|sk-secret-key/);
  });

  it("rejects missing configuration before any call", () => {
    expect(() => createDashboardLlm({ apiKey: "", model: "m" }, vi.fn())).toThrow(
      "Invalid Claude configuration keys",
    );
  });
});
