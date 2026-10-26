import { z } from "zod";

export const paypalEnvironmentSchema = z.literal("SANDBOX");
export {
  createPayPalRestClient,
  PayPalApiError,
  type PayPalRestClient,
  type PayPalRestPath,
} from "./rest/index";
export { buildInvoiceRequest, buildSendRequest, buildSeriesRequest } from "./rest/invoicing";
export {
  type CaptureRecord,
  createPayPalLedger,
  type LedgerRow,
  type PayPalLedger,
  toCaptureRecord,
} from "./sdk/index";
export { verifyWebhookSignature } from "./webhooks/index";
