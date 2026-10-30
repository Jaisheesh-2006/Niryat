import { expect, it } from "vitest";
import { agentNoteSchema } from "./notes";

it("trims supported text and applies note and reason lengths", () => {
  expect(agentNoteSchema(800).parse("  Review the outstanding payment.  ")).toBe(
    "Review the outstanding payment.",
  );
  expect(agentNoteSchema(300, 10).parse("Please review")).toBe("Please review");
  expect(agentNoteSchema(800).safeParse("Please review").success).toBe(false);
});

it.each([
  "Review invoice one 1",
  "Review invoice one ²",
  "Email a@b please now",
  "Review HTTP details please",
  "Review www.site please",
  "Review <invoice> please",
  "Review payment\tplease",
  "Review payment 😀 please",
  "x".repeat(801),
])("rejects unsafe or invalid note text", (value) => {
  expect(agentNoteSchema(800).safeParse(value).success).toBe(false);
});
