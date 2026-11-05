import { type ManualCloseInput, manualCloseInputSchema } from "@niryat/shared";
import { z } from "zod";

interface TaskStarter {
  startTask(
    slug: string,
    input: ManualCloseInput[],
    options: { idempotencyKey: string },
  ): Promise<unknown>;
}

export function createCloseDispatcher(client: TaskStarter) {
  return async (input: unknown): Promise<void> => {
    const parsed = manualCloseInputSchema.parse(input);
    const result = await client.startTask("niryat-worker/monthlyClose", [parsed], {
      idempotencyKey: parsed.runId,
    });
    z.object({ taskRunId: z.string().min(1) }).parse(result);
  };
}
