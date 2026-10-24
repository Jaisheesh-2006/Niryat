import { expect, it } from "vitest";
import { actionStatusSchema } from "./index";

it("limits action status to the planned approval lifecycle", () => {
  expect(actionStatusSchema.parse("proposed")).toBe("proposed");
  expect(actionStatusSchema.safeParse("auto-approved").success).toBe(false);
});
