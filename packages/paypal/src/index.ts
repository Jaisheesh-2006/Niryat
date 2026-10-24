import { z } from "zod";

export const paypalEnvironmentSchema = z.literal("SANDBOX");
export { verifyWebhookSignature } from "./webhooks/index";
