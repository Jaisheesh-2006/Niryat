import { expect, it } from "vitest";
import { paypalEnvironmentSchema, verifyWebhookSignature } from "./index";

it("allows sandbox only and fails closed for unimplemented signatures", async () => {
  expect(paypalEnvironmentSchema.safeParse("SANDBOX").success).toBe(true);
  expect(paypalEnvironmentSchema.safeParse("PRODUCTION").success).toBe(false);
  await expect(verifyWebhookSignature({})).rejects.toThrow("not implemented");
});
