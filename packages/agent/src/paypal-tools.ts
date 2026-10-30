import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { z } from "zod";
import type { AgentTool } from "./claude";
import type { CloseAgentInput, ToolLog } from "./close-agent";

export const PAYPAL_READ_TOOLS = [
  "get_invoice",
  "list_invoices",
  "get_dispute",
  "list_disputes",
  "list_transactions",
] as const;
const readName = z.enum(PAYPAL_READ_TOOLS);
export interface PayPalReader {
  run(tool: (typeof PAYPAL_READ_TOOLS)[number], args: Record<string, unknown>): Promise<string>;
}

export function createToolkitReader(config: {
  clientId: string;
  clientSecret: string;
}): PayPalReader {
  const credentials = z
    .strictObject({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
    .safeParse(config);
  if (!credentials.success) throw new Error("Invalid PayPal credential keys");
  const toolkit = new PayPalAgentToolkit({
    ...credentials.data,
    configuration: {
      actions: {
        invoices: { get: true, list: true },
        disputes: { get: true, list: true },
        transactions: { list: true },
      },
      context: { sandbox: true },
    },
  });
  return {
    async run(name, args) {
      const tool = readName.parse(name);
      const parameters = z.record(z.string(), z.json()).parse(args);
      const result = z.object({ content: z.string() }).safeParse(
        await toolkit.handleToolCall({
          id: "niryat-read",
          type: "function",
          function: { name: tool, arguments: JSON.stringify(parameters) },
        }),
      );
      if (!result.success) throw new Error("Invalid Toolkit content");
      return result.data.content;
    },
  };
}

const money = z.object({ currency_code: z.string(), value: z.string() });
const invoice = z
  .object({
    id: z.string(),
    status: z.string().optional(),
    detail: z
      .object({ invoice_number: z.string().optional(), invoice_date: z.string().optional() })
      .optional(),
    amount: money.optional(),
    due_amount: money.optional(),
    payments: z.object({ paid_amount: money.optional() }).optional(),
    refunds: z.object({ refund_amount: money.optional() }).optional(),
  })
  .transform((row) => ({
    id: row.id,
    status: row.status,
    invoiceNumber: row.detail?.invoice_number,
    invoiceDate: row.detail?.invoice_date,
    amount: row.amount,
    dueAmount: row.due_amount,
    paidAmount: row.payments?.paid_amount,
    refundedAmount: row.refunds?.refund_amount,
  }));
const disputeSummary = z.object({
  dispute_id: z.string(),
  status: z.string().optional(),
  dispute_life_cycle_stage: z.string().optional(),
  reason: z.string().optional(),
  dispute_amount: money.optional(),
  update_time: z.string().optional(),
});
function projectDispute(row: z.infer<typeof disputeSummary>) {
  return {
    disputeId: row.dispute_id,
    status: row.status,
    stage: row.dispute_life_cycle_stage,
    reason: row.reason,
    amount: row.dispute_amount,
    updateTime: row.update_time,
  };
}
const dispute = disputeSummary
  .extend({
    create_time: z.string().optional(),
    seller_response_due_date: z.string().optional(),
    dispute_outcome: z.object({ outcome_code: z.string().optional() }).optional(),
    disputed_transactions: z
      .array(z.object({ seller_transaction_id: z.string().optional() }))
      .optional(),
  })
  .transform((row) => ({
    ...projectDispute(row),
    createTime: row.create_time,
    sellerResponseDueDate: row.seller_response_due_date,
    outcome: row.dispute_outcome?.outcome_code,
    captureIds: row.disputed_transactions?.flatMap((item) =>
      item.seller_transaction_id ? [item.seller_transaction_id] : [],
    ),
  }));
const transaction = z
  .object({
    transaction_info: z.object({
      transaction_id: z.string(),
      transaction_event_code: z.string().optional(),
      transaction_status: z.string().optional(),
      transaction_amount: money.optional(),
      fee_amount: money.optional(),
      transaction_initiation_date: z.string().optional(),
      invoice_id: z.string().optional(),
    }),
  })
  .transform(({ transaction_info: row }) => ({
    transactionId: row.transaction_id,
    eventCode: row.transaction_event_code,
    status: row.transaction_status,
    amount: row.transaction_amount,
    fee: row.fee_amount,
    initiatedAt: row.transaction_initiation_date,
    invoiceId: row.invoice_id,
  }));

const PAYPAL_READS_PER_RUN = 15;
export function paypalReadTools(
  reader: PayPalReader,
  known: CloseAgentInput["known"],
  log: ToolLog,
  kind: CloseAgentInput["kind"],
): readonly AgentTool[] {
  let reads = 0;
  function define<S extends z.ZodRawShape>(
    name: (typeof PAYPAL_READ_TOOLS)[number],
    shape: S,
    prepare: (args: z.infer<z.ZodObject<S>>) => Record<string, unknown> | string,
    project: (raw: unknown, args: z.infer<z.ZodObject<S>>) => object,
  ): AgentTool {
    const tool = `paypal_${name}`;
    return {
      name: tool,
      description: `Read PayPal ${name.replaceAll("_", " ")} for this user only.`,
      shape,
      async handler(args) {
        const parsed = z.strictObject(shape).safeParse(args);
        let text: string | undefined;
        let items = 0;
        let error: string | undefined;
        reads++;
        if (reads > PAYPAL_READS_PER_RUN) error = "read_limit_reached";
        else if (!parsed.success) error = "invalid_input";
        else {
          const parameters = prepare(parsed.data);
          if (typeof parameters === "string") error = parameters;
          else {
            try {
              const raw: unknown = JSON.parse(z.string().parse(await reader.run(name, parameters)));
              const envelope = z
                .object({ ok: z.boolean().optional(), error: z.unknown().optional() })
                .parse(raw);
              if (envelope.ok === false || envelope.error !== undefined)
                error = "paypal_read_failed";
              else {
                const output = project(raw, parsed.data);
                const list = z.object({ items: z.array(z.unknown()) }).safeParse(output);
                items = list.success ? list.data.items.length : 1;
                text = JSON.stringify(output);
              }
            } catch {
              error = "paypal_read_failed";
            }
          }
        }
        text ??= `Rejected: ${error}`;
        await log({
          tool,
          input: parsed.success ? parsed.data : {},
          output: { items, bytes: Buffer.byteLength(text), ...(error ? { error } : {}) },
          ok: !error,
        });
        return { text, ...(error ? { isError: true } : {}) };
      },
    };
  }
  const tools = [
    define(
      "get_invoice",
      { invoiceId: z.string().regex(/^[A-Za-z0-9_-]{1,127}$/) },
      ({ invoiceId }) =>
        known.paypalInvoiceIds.has(invoiceId) ? { invoice_id: invoiceId } : "unknown_entity",
      (raw, { invoiceId }) => {
        const row = invoice.parse(raw);
        if (row.id !== invoiceId) throw new Error("invoice_id mismatch");
        return row;
      },
    ),
    define(
      "get_dispute",
      { disputeId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/) },
      ({ disputeId }) =>
        known.disputeIds.has(disputeId) ? { dispute_id: disputeId } : "unknown_entity",
      (raw, { disputeId }) => {
        const row = dispute.parse(raw);
        if (row.disputeId !== disputeId) throw new Error("dispute_id mismatch");
        return { ...row, captureIds: row.captureIds?.filter((id) => known.paypalTxnIds.has(id)) };
      },
    ),
  ];
  if (kind === "monthly_close")
    tools.push(
      define(
        "list_invoices",
        {
          status: z
            .enum(["SENT", "PAID", "PARTIALLY_PAID", "REFUNDED", "PARTIALLY_REFUNDED"])
            .optional(),
        },
        () => ({ page_size: 50 }),
        (raw, { status }) => ({
          items: z
            .object({ items: z.array(invoice) })
            .parse(raw)
            .items.filter(
              (row) => known.paypalInvoiceIds.has(row.id) && (!status || row.status === status),
            ),
        }),
      ),
      define(
        "list_disputes",
        {},
        () => ({ page_size: 50 }),
        (raw) => {
          const rows = z.object({ items: z.array(disputeSummary) }).parse(raw).items;
          return {
            items: rows.filter((row) => known.disputeIds.has(row.dispute_id)).map(projectDispute),
            otherDisputes: rows.filter((row) => !known.disputeIds.has(row.dispute_id)).length,
          };
        },
      ),
      define(
        "list_transactions",
        { startDate: z.iso.date(), endDate: z.iso.date() },
        ({ startDate, endDate }) => {
          const month = z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .safeParse(known.month);
          const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
          if (
            !month.success ||
            !startDate.startsWith(`${month.data}-`) ||
            !endDate.startsWith(`${month.data}-`) ||
            days < 1 ||
            days > 31
          )
            return "invalid_date_range";
          return {
            start_date: `${startDate}T00:00:00Z`,
            end_date: `${endDate}T23:59:59Z`,
            page_size: 100,
          };
        },
        (raw) => ({
          items: z
            .object({ transaction_details: z.array(transaction) })
            .parse(raw)
            .transaction_details.filter(
              (row) =>
                known.paypalTxnIds.has(row.transactionId) ||
                (row.invoiceId !== undefined && known.paypalInvoiceIds.has(row.invoiceId)),
            )
            .slice(0, 100),
        }),
      ),
    );
  return tools;
}
