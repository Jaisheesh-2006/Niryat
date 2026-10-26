import { verifyWebhookSignature } from "@niryat/paypal";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { recordCapture } from "../payments";
import type { AppDeps } from "./auth";

const envelopeSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: z.unknown(),
});
const captureSchema = z.object({ id: z.string().min(1) });
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
