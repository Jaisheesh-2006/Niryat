import { type TaskContext, task } from "@renderinc/sdk/workflows";
import { z } from "zod";

export const monthlyCloseInputSchema = z.strictObject({
  userId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export function monthlyCloseStub(input: unknown) {
  const validated = monthlyCloseInputSchema.parse(input);
  // TODO: Implement spec 08; no syncing, scheduling, AI calls or PayPal actions yet.
  return { ...validated, status: "not_implemented" as const };
}
export const monthlyClose = task(
  { name: "monthlyClose" },
  (_context: TaskContext, input: unknown) => monthlyCloseStub(input),
);
