import { expect, it } from "vitest";
import { paypalEnvironmentSchema } from "./index";

it("allows sandbox only", () => {
  expect(paypalEnvironmentSchema.safeParse("SANDBOX").success).toBe(true);
  expect(paypalEnvironmentSchema.safeParse("PRODUCTION").success).toBe(false);
});
