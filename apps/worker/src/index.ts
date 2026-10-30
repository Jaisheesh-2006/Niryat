import { runScheduledCloseFromEnv } from "@niryat/api/close";
import { type TaskContext, task } from "@renderinc/sdk/workflows";
import { z } from "zod";

export const monthlyCloseInputSchema = z.strictObject({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  asOf: z.iso.date().optional(),
});
export const monthlyClose = task(
  { name: "monthlyClose", timeoutSeconds: 900 },
  (_context: TaskContext, input: unknown) => {
    const { month, asOf } = monthlyCloseInputSchema.parse(input);
    return runScheduledCloseFromEnv({
      ...(month !== undefined ? { month } : {}),
      ...(asOf !== undefined ? { asOf } : {}),
    });
  },
);
