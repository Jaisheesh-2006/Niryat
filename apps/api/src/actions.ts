import type { ActionHandler, PayPalActionName } from "@niryat/agent";
import { getInvoiceForAction, markSent, setPayPalInvoiceId } from "@niryat/db";
import { invoiceInputSchema } from "@niryat/shared";
import { z } from "zod";
import type { AppDeps } from "./routes/auth";

const sendInvoicePayloadSchema = z.strictObject({
  invoiceId: z.uuid(),
  create: z.strictObject({
    detail: z.strictObject({
      invoice_number: z.string().min(1),
      invoice_date: z.iso.date(),
      currency_code: invoiceInputSchema.shape.currency,
      note: z.string(),
      terms_and_conditions: z.string().optional(),
      payment_term: z.strictObject({ term_type: z.literal("DUE_ON_RECEIPT") }),
    }),
    invoicer: z.strictObject({ business_name: z.string().min(1), tax_id: z.string().optional() }),
    primary_recipients: z
      .array(
        z.strictObject({
          billing_info: z.strictObject({
            email_address: z.email(),
            business_name: z.string().min(1),
          }),
        }),
      )
      .length(1),
    items: z
      .array(
        z.strictObject({
          name: invoiceInputSchema.shape.description,
          quantity: z.literal("1"),
          unit_amount: z.strictObject({
            currency_code: invoiceInputSchema.shape.currency,
            value: invoiceInputSchema.shape.amount,
          }),
        }),
      )
      .length(1),
  }),
  send: z.strictObject({
    subject: z.string().min(1),
    send_to_recipient: z.literal(true),
    send_to_invoicer: z.literal(false),
  }),
});

const paypalInvoiceIdSchema = z.string().regex(/^INV2-[A-Z0-9-]+$/);
const createdSchema = z
  .object({ id: paypalInvoiceIdSchema.optional(), href: z.url().optional() })
  .transform((reply) => reply.id ?? reply.href?.split("/").pop())
  .pipe(paypalInvoiceIdSchema);
const parseAny = z.json().optional().parse;

export function actionHandlers(deps: AppDeps): Readonly<Record<PayPalActionName, ActionHandler>> {
  return {
    async send_invoice(action) {
      const parsed = sendInvoicePayloadSchema.safeParse(action.payload);
      const invoice = await getInvoiceForAction(deps.db, action.userId, action.id);
      if (!parsed.success || !invoice || parsed.data.invoiceId !== invoice.id) {
        throw Object.assign(new Error("invalid_payload"), { code: "invalid_payload" });
      }
      const paypal = deps.paypal;
      if (!paypal) throw new Error("PayPal unavailable");
      const payload = parsed.data;
      let id = invoice.paypalInvoiceId;
      if (id === null) {
        id = await paypal.rest.post(
          "/v2/invoicing/invoices",
          payload.create,
          `${action.id}-create`,
          createdSchema.parse,
        );
        await setPayPalInvoiceId(deps.db, action.userId, invoice.id, id);
      }
      const paypalId = paypalInvoiceIdSchema.safeParse(id);
      if (!paypalId.success) {
        throw Object.assign(new Error("invalid_payload"), { code: "invalid_payload" });
      }
      await paypal.rest.post(
        `/v2/invoicing/invoices/${paypalId.data}/send`,
        payload.send,
        `${action.id}-send`,
        parseAny,
      );
      await markSent(deps.db, action.userId, invoice.id);
    },
    async create_recurring_series() {
      throw Object.assign(new Error("invalid_payload"), { code: "invalid_payload" });
    },
  };
}
