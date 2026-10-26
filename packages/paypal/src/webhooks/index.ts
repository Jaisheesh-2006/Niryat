import { z } from "zod";
import { PayPalApiError, type PayPalRestClient } from "../rest/index";

const verificationSchema = z.object({ verification_status: z.enum(["SUCCESS", "FAILURE"]) });
const eventSchema = z.looseObject({});

export async function verifyWebhookSignature(
  input: { headers: Headers; event: unknown; webhookId: string },
  rest: PayPalRestClient,
): Promise<boolean> {
  const transmissionId = input.headers.get("paypal-transmission-id");
  const transmissionTime = input.headers.get("paypal-transmission-time");
  const transmissionSig = input.headers.get("paypal-transmission-sig");
  const certUrl = input.headers.get("paypal-cert-url");
  const authAlgo = input.headers.get("paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo)
    return false;
  const event = eventSchema.safeParse(input.event);
  if (!event.success) throw new PayPalApiError(0, "INVALID_REQUEST");
  const result = await rest.post(
    "/v1/notifications/verify-webhook-signature",
    {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: input.webhookId,
      webhook_event: event.data,
    },
    transmissionId,
    verificationSchema.parse,
  );
  return result.verification_status === "SUCCESS";
}
