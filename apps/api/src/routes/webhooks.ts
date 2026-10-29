import { getInvoiceRefundIds, verifyWebhookSignature } from "@niryat/paypal";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { recordDispute } from "../disputes";
import { recordCapture, recordRefundById } from "../payments";
import type { AppDeps } from "./auth";

const envelopeSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: z.unknown(),
});
const captureSchema = z.object({ id: z.string().min(1) });
const refundSchema = z.object({ id: z.string().min(1) });
const disputeSchema = z.object({ dispute_id: z.string().min(1) });
const invoiceIdSchema = z.string().regex(/^INV2-[A-Z0-9-]+$/);
const invoiceRefundedSchema = z.union([
  z.object({ id: invoiceIdSchema }).transform((invoice) => invoice.id),
  z
    .object({ invoice: z.object({ id: invoiceIdSchema }) })
    .transform((resource) => resource.invoice.id),
]);
const invoicePaidSchema = z.object({
  invoice: z.object({
    payments: z.object({
      transactions: z.array(z.object({ payment_id: z.string().min(1) })),
    }),
  }),
});

export function webhookRoutes(deps: AppDeps): Hono {
  const routes = new Hono();
  const paypal = deps.paypal;
  if (!paypal) return routes;
  routes.post("/webhooks/paypal", bodyLimit({ maxSize: 256 * 1024 }), async (c) => {
    let event: unknown;
    try {
      event = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    try {
      const verified = await verifyWebhookSignature(
        { headers: c.req.raw.headers, event, webhookId: paypal.webhookId },
        paypal.rest,
      );
      if (!verified) return c.json({ error: "invalid_signature" }, 400);
      const envelope = envelopeSchema.safeParse(event);
      if (!envelope.success) return c.json({ error: "invalid_request" }, 400);
      const { event_type, resource } = envelope.data;
      if (
        event_type === "PAYMENT.CAPTURE.REFUNDED" ||
        event_type === "PAYMENT.CAPTURE.REVERSED" ||
        event_type === "INVOICING.INVOICE.REFUNDED"
      ) {
        let refundIds: string[];
        if (event_type === "INVOICING.INVOICE.REFUNDED") {
          const invoice = invoiceRefundedSchema.safeParse(resource);
          if (!invoice.success) return c.json({ error: "invalid_request" }, 400);
          refundIds = await getInvoiceRefundIds(paypal.rest, invoice.data);
        } else {
          const refund = refundSchema.safeParse(resource);
          if (!refund.success) return c.json({ error: "invalid_request" }, 400);
          refundIds = [refund.data.id];
        }
        const counts = { recorded: 0, not_completed: 0, not_found: 0 };
        for (const refundId of refundIds) {
          const outcome = await recordRefundById({ db: deps.db, ledger: paypal.ledger }, refundId);
          counts[outcome]++;
        }
        console.log({ event_type, ...counts });
        if (counts.not_completed > 0 || counts.not_found > 0) {
          return c.json({ error: "refund_not_ready" }, 503);
        }
        return c.json({ status: "recorded" });
      }
      if (
        event_type === "CUSTOMER.DISPUTE.CREATED" ||
        event_type === "CUSTOMER.DISPUTE.UPDATED" ||
        event_type === "CUSTOMER.DISPUTE.RESOLVED"
      ) {
        const dispute = disputeSchema.safeParse(resource);
        if (!dispute.success) return c.json({ error: "invalid_request" }, 400);
        const outcome = await recordDispute(
          { db: deps.db, rest: paypal.rest, ledger: paypal.ledger },
          dispute.data.dispute_id,
        );
        console.log({ event_type, [outcome]: 1 });
        return c.json({ status: "recorded" });
      }
      let captureIds: string[];
      if (event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const capture = captureSchema.safeParse(resource);
        if (!capture.success) return c.json({ error: "invalid_request" }, 400);
        captureIds = [capture.data.id];
      } else if (event_type === "INVOICING.INVOICE.PAID") {
        const invoice = invoicePaidSchema.safeParse(resource);
        if (!invoice.success) return c.json({ error: "invalid_request" }, 400);
        captureIds = invoice.data.invoice.payments.transactions.map(
          (payment) => payment.payment_id,
        );
      } else {
        console.log({ event_type, ignored: 1 });
        return c.json({ status: "ignored" });
      }
      const counts = { recorded: 0, not_completed: 0, not_found: 0 };
      for (const captureId of captureIds) {
        const outcome = await recordCapture({ db: deps.db, ledger: paypal.ledger }, captureId);
        counts[outcome]++;
      }
      console.log({ event_type, ...counts });
      return c.json({ status: "recorded" });
    } catch {
      return c.json({ error: "internal_error" }, 500);
    }
  });
  return routes;
}
