import { parseArgs } from "node:util";
import { Render } from "@renderinc/sdk";
import { z } from "zod";
import { monthlyCloseInputSchema } from "./index";

const renderEnvSchema = z
  .object({
    RENDER_API_KEY: z.string().optional(),
    RENDER_USE_LOCAL_DEV: z.string().optional(),
  })
  .refine((env) => env.RENDER_USE_LOCAL_DEV === "true" || Boolean(env.RENDER_API_KEY?.trim()), {
    path: ["RENDER_API_KEY"],
  });
const taskRunSchema = z.object({ taskRunId: z.string().min(1) });

interface TaskStarter {
  startTask(slug: string, input: z.infer<typeof monthlyCloseInputSchema>[]): Promise<unknown>;
}

export async function main(args: string[] = [], client?: TaskStarter): Promise<void> {
  let input: z.infer<typeof monthlyCloseInputSchema>;
  try {
    const { values } = parseArgs({
      args: args[0] === "--" ? args.slice(1) : args,
      options: { month: { type: "string" }, "as-of": { type: "string" } },
      allowPositionals: false,
    });
    input = monthlyCloseInputSchema.parse({
      ...(values.month !== undefined ? { month: values.month } : {}),
      ...(values["as-of"] !== undefined ? { asOf: values["as-of"] } : {}),
    });
  } catch {
    console.error("Invalid arguments: month, as-of.");
    process.exitCode = 1;
    return;
  }
  if (!renderEnvSchema.safeParse(process.env).success) {
    console.error("Invalid environment: RENDER_API_KEY.");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await (client ?? new Render().workflows).startTask(
      "niryat-worker/monthlyClose",
      [input],
    );
    console.log(JSON.stringify(taskRunSchema.parse(result)));
  } catch {
    console.error("Monthly close trigger failed");
    process.exitCode = 1;
  }
}

if (import.meta.main) void main(process.argv.slice(2));
