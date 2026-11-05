import { runScheduledCloseFromEnv } from "@niryat/api/close";
import { monthlyCloseInputSchema } from "@niryat/shared";
import { type TaskContext, task } from "@renderinc/sdk/workflows";

export { monthlyCloseInputSchema } from "@niryat/shared";
export const monthlyClose = task(
  { name: "monthlyClose", timeoutSeconds: 900 },
  (_context: TaskContext, input: unknown) => {
    return runScheduledCloseFromEnv(monthlyCloseInputSchema.parse(input));
  },
);
