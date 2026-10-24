import { expect, it } from "vitest";
import { identifierSchema } from "./index";

it("rejects empty identifiers at the boundary", () => {
  expect(identifierSchema.safeParse("  ").success).toBe(false);
  expect(identifierSchema.parse(" example ")).toBe("example");
});
