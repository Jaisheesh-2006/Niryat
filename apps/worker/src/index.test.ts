import { expect, it } from "vitest";
import { monthlyCloseStub } from "./index";

it("validates the task boundary and explicitly returns a stub result", () => {
  expect(monthlyCloseStub({ userId: "example", month: "2026-10" })).toEqual({
    userId: "example",
    month: "2026-10",
    status: "not_implemented",
  });
  expect(() => monthlyCloseStub({ userId: "", month: "2026-99" })).toThrow();
});
