import { beforeEach, expect, it, vi } from "vitest";
import type { CloseAgentInput } from "./close-agent";
import { createToolkitReader, PAYPAL_READ_TOOLS, paypalReadTools } from "./paypal-tools";

const toolkit = vi.hoisted(() => ({
  construct: vi.fn(),
  call: vi.fn(async () => ({ content: "{}" })),
}));
vi.mock("@paypal/agent-toolkit/openai", () => ({
  PayPalAgentToolkit: class {
    constructor(config: unknown) {
      toolkit.construct(config);
    }
    handleToolCall = toolkit.call;
  },
}));
beforeEach(() => vi.clearAllMocks());

const known: CloseAgentInput["known"] = {
  candidates: [],
  invoiceIds: new Set(),
  clientIds: new Set(),
  disputeIds: new Set(["PP-OWN"]),
  firaLineIds: new Set(),
  paypalInvoiceIds: new Set(["INV2-OWN"]),
  paypalTxnIds: new Set(["TXN-OWN"]),
  month: "2026-10",
};
function setup(raw: unknown = {}, kind: CloseAgentInput["kind"] = "monthly_close") {
  const run = vi.fn(async () => JSON.stringify(raw));
  const log = vi.fn(
    async (_call: { tool: string; input: unknown; output: unknown; ok: boolean }) => {},
  );
  const tools = paypalReadTools({ run }, known, log, kind);
  async function call(name: string, args: unknown = {}) {
    const tool = tools.find((tool) => tool.name === `paypal_${name}`);
    if (!tool) throw new Error("Missing test tool");
    const before = log.mock.calls.length;
    const result = await tool.handler(args);
    expect(log).toHaveBeenCalledTimes(before + 1);
    const entry = log.mock.calls.at(-1)?.[0];
    expect(entry?.output).toEqual(
      expect.objectContaining({ items: expect.any(Number), bytes: Buffer.byteLength(result.text) }),
    );
    return result;
  }
  return { run, log, tools, call };
}
const amount = { currency_code: "USD", value: "12.00", private: "hidden money field" };
const ownInvoice = {
  id: "INV2-OWN",
  status: "SENT",
  detail: { invoice_number: "2026/0001", invoice_date: "2026-10-01", note: "private note" },
  amount,
  due_amount: amount,
  payments: { paid_amount: amount },
  refunds: { refund_amount: amount },
  primary_recipients: [
    { billing_info: { email_address: "private@example.com", name: "Private name" } },
  ],
  links: ["private link"],
};

it("projects known invoices and logs a summary without contact details or body", async () => {
  const { call, run, log } = setup(ownInvoice);
  const result = await call("get_invoice", { invoiceId: "INV2-OWN" });
  const safeMoney = { currency_code: "USD", value: "12.00" };
  expect(JSON.parse(result.text)).toEqual({
    id: "INV2-OWN",
    status: "SENT",
    invoiceNumber: "2026/0001",
    invoiceDate: "2026-10-01",
    amount: safeMoney,
    dueAmount: safeMoney,
    paidAmount: safeMoney,
    refundedAmount: safeMoney,
  });
  expect(run).toHaveBeenCalledExactlyOnceWith("get_invoice", { invoice_id: "INV2-OWN" });
  expect(log).toHaveBeenCalledExactlyOnceWith({
    tool: "paypal_get_invoice",
    input: { invoiceId: "INV2-OWN" },
    output: { items: 1, bytes: Buffer.byteLength(result.text) },
    ok: true,
  });
  expect(JSON.stringify([result, log.mock.calls])).not.toMatch(
    /private|primary_recipients|billing_info|email_address/i,
  );
});

it("rejects unknown IDs and extra inputs before dispatch", async () => {
  const { call, run } = setup(ownInvoice);
  expect(await call("get_invoice", { invoiceId: "INV2-OTHER" })).toEqual({
    text: "Rejected: unknown_entity",
    isError: true,
  });
  expect((await call("get_dispute", { disputeId: "PP-OTHER" })).text).toBe(
    "Rejected: unknown_entity",
  );
  expect((await call("get_invoice", { invoiceId: "INV2-OWN", note: "extra" })).isError).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

it("does not dispatch or log contact details passed as a PayPal ID", async () => {
  const { call, log, run } = setup();
  expect((await call("get_invoice", { invoiceId: "private@example.com" })).isError).toBe(true);
  expect((await call("get_dispute", { disputeId: "private@example.com" })).isError).toBe(true);
  expect(run).not.toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.com");
});

it("rejects a mismatched returned entity", async () => {
  expect(
    (await setup({ id: "INV2-OTHER" }).call("get_invoice", { invoiceId: "INV2-OWN" })).text,
  ).toBe("Rejected: paypal_read_failed");
  expect(
    (await setup({ dispute_id: "PP-OTHER" }).call("get_dispute", { disputeId: "PP-OWN" })).text,
  ).toBe("Rejected: paypal_read_failed");
});

it("filters invoice lists by ownership and status locally", async () => {
  const { call, run } = setup({
    items: [ownInvoice, { id: "INV2-OTHER", status: "SENT", email: "other@example.com" }],
  });
  const result = await call("list_invoices", { status: "SENT" });
  expect(JSON.parse(result.text).items).toHaveLength(1);
  expect(result.text).not.toMatch(/OTHER|example.com/);
  expect(run).toHaveBeenCalledWith("list_invoices", { page_size: 50 });
  expect(JSON.parse((await call("list_invoices", { status: "PAID" })).text)).toEqual({ items: [] });
});

it("filters summary-only disputes by known ownership and counts others", async () => {
  const own = {
    dispute_id: "PP-OWN",
    status: "OPEN",
    dispute_life_cycle_stage: "INQUIRY",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    dispute_amount: amount,
    update_time: "2026-10-02T00:00:00Z",
    buyer: { email: "private@example.com" },
  };
  const { call, log } = setup({
    items: [own, { dispute_id: "PP-OTHER", reason: "private reason" }],
  });
  const result = await call("list_disputes");
  expect(JSON.parse(result.text)).toEqual({
    items: [
      {
        disputeId: "PP-OWN",
        status: "OPEN",
        stage: "INQUIRY",
        reason: own.reason,
        amount: { currency_code: "USD", value: "12.00" },
        updateTime: own.update_time,
      },
    ],
    otherDisputes: 1,
  });
  expect(JSON.stringify([result, log.mock.calls])).not.toMatch(
    /private|PP-OTHER|buyer|example.com/,
  );
});

it("projects dispute details and limits capture IDs to the user's payments", async () => {
  const { call } = setup({
    dispute_id: "PP-OWN",
    create_time: "2026-10-01T00:00:00Z",
    seller_response_due_date: "2026-10-08T00:00:00Z",
    dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR", private: "hidden" },
    disputed_transactions: [
      { seller_transaction_id: "TXN-OWN", buyer: "hidden" },
      { seller_transaction_id: "TXN-OTHER" },
    ],
  });
  expect(JSON.parse((await call("get_dispute", { disputeId: "PP-OWN" })).text)).toEqual({
    disputeId: "PP-OWN",
    createTime: "2026-10-01T00:00:00Z",
    sellerResponseDueDate: "2026-10-08T00:00:00Z",
    outcome: "RESOLVED_BUYER_FAVOUR",
    captureIds: ["TXN-OWN"],
  });
});

it.each([
  { startDate: "2026-09-30", endDate: "2026-10-01" },
  { startDate: "2026-10-01", endDate: "2026-11-01" },
  { startDate: "2026-10-10", endDate: "2026-10-01" },
  { startDate: "2026-10-00", endDate: "2026-10-31" },
  { startDate: "2026-10-01", endDate: "2026-10-31", transaction_id: "TXN-OWN" },
])("rejects unbounded transaction ranges and lookback arguments", async (range) => {
  const { call, run } = setup();
  expect((await call("list_transactions", range)).isError).toBe(true);
  expect(run).not.toHaveBeenCalled();
});

it("projects and filters transactions, with at most a hundred returned", async () => {
  const row = {
    transaction_info: {
      transaction_id: "TXN-OWN",
      transaction_event_code: "T0006",
      transaction_status: "S",
      transaction_amount: amount,
      fee_amount: amount,
      transaction_initiation_date: "2026-10-01T00:00:00Z",
      invoice_id: "merchant-number",
      payer_email: "private@example.com",
    },
    payer_info: { name: "Private" },
  };
  const { call, run, log } = setup({
    transaction_details: [
      row,
      { transaction_info: { transaction_id: "TXN-BY-INVOICE", invoice_id: "INV2-OWN" } },
      { transaction_info: { transaction_id: "TXN-OTHER", invoice_id: "merchant-other" } },
    ],
  });
  const result = await call("list_transactions", {
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  });
  expect(JSON.parse(result.text)).toEqual({
    items: [
      {
        transactionId: "TXN-OWN",
        eventCode: "T0006",
        status: "S",
        amount: { currency_code: "USD", value: "12.00" },
        fee: { currency_code: "USD", value: "12.00" },
        initiatedAt: "2026-10-01T00:00:00Z",
        invoiceId: "merchant-number",
      },
      { transactionId: "TXN-BY-INVOICE", invoiceId: "INV2-OWN" },
    ],
  });
  expect(run).toHaveBeenCalledWith("list_transactions", {
    start_date: "2026-10-01T00:00:00Z",
    end_date: "2026-10-31T23:59:59Z",
    page_size: 100,
  });
  expect(JSON.stringify([result, log.mock.calls])).not.toMatch(/private|TXN-OTHER|payer_info/i);
  const many = setup({ transaction_details: Array(101).fill(row) });
  expect(
    JSON.parse(
      (await many.call("list_transactions", { startDate: "2026-10-01", endDate: "2026-10-31" }))
        .text,
    ).items,
  ).toHaveLength(100);
});

it.each([
  { ok: false, status: 401, code: "UNAUTHORIZED", message: "private token" },
  { error: { message: "private email", type: "paypal_error" } },
  { id: 42 },
  null,
])("rejects error envelopes and malformed results without logging bodies", async (raw) => {
  const { call, log } = setup(raw);
  expect((await call("get_invoice", { invoiceId: "INV2-OWN" })).text).toBe(
    "Rejected: paypal_read_failed",
  );
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|message|token/);
});

it("rejects invalid JSON and thrown reads", async () => {
  const { call, run } = setup();
  run.mockResolvedValueOnce("not json").mockRejectedValueOnce(new Error("private token"));
  for (let index = 0; index < 2; index++)
    expect((await call("get_invoice", { invoiceId: "INV2-OWN" })).text).toBe(
      "Rejected: paypal_read_failed",
    );
});

it("shares a read limit across tools and blocks the sixteenth dispatch", async () => {
  const { call, run } = setup({ items: [] });
  for (let index = 0; index < 15; index++)
    await call(index % 2 ? "list_disputes" : "list_invoices");
  expect((await call("list_invoices")).text).toBe("Rejected: read_limit_reached");
  expect(run).toHaveBeenCalledTimes(15);
});

it("propagates a failed transparency log without logging twice", async () => {
  const run = vi.fn(async () => JSON.stringify(ownInvoice));
  const log = vi.fn(async () => {
    throw new Error("log_write_failed");
  });
  const tool = paypalReadTools({ run }, known, log, "monthly_close").find(
    ({ name }) => name === "paypal_get_invoice",
  );
  if (!tool) throw new Error("Missing test tool");
  await expect(tool.handler({ invoiceId: "INV2-OWN" })).rejects.toThrow("log_write_failed");
  expect(log).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledTimes(1);
});

it("registers only the five read names and limits reminder investigations", () => {
  expect(PAYPAL_READ_TOOLS).toEqual([
    "get_invoice",
    "list_invoices",
    "get_dispute",
    "list_disputes",
    "list_transactions",
  ]);
  expect(PAYPAL_READ_TOOLS.join(" ")).not.toMatch(
    /create|send|update|cancel|delete|record|accept|capture|refund|activate|generate|remind/,
  );
  expect(
    setup()
      .tools.map(({ name }) => name.replace("paypal_", ""))
      .sort(),
  ).toEqual([...PAYPAL_READ_TOOLS].sort());
  expect(setup({}, "reminders").tools.map(({ name }) => name)).toEqual([
    "paypal_get_invoice",
    "paypal_get_dispute",
  ]);
});

it("constructs the adapter with sandbox read configuration and validates before dispatch", async () => {
  const reader = createToolkitReader({ clientId: "fake-id", clientSecret: "fake-secret" });
  expect(toolkit.construct).toHaveBeenCalledExactlyOnceWith({
    clientId: "fake-id",
    clientSecret: "fake-secret",
    configuration: {
      actions: {
        invoices: { get: true, list: true },
        disputes: { get: true, list: true },
        transactions: { list: true },
      },
      context: { sandbox: true },
    },
  });
  await expect(reader.run("get_invoice", { invoice_id: "INV2-OWN" })).resolves.toBe("{}");
  expect(toolkit.call).toHaveBeenCalledExactlyOnceWith({
    id: "niryat-read",
    type: "function",
    function: { name: "get_invoice", arguments: '{"invoice_id":"INV2-OWN"}' },
  });
  // @ts-expect-error write tools must never reach the Toolkit dispatcher
  await expect(reader.run("send_invoice", {})).rejects.toThrow();
  expect(toolkit.call).toHaveBeenCalledTimes(1);
});
