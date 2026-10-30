import type { ActionStatus, paypalActionNames } from "@niryat/shared";
import { z } from "zod";

export { type ActionStatus, actionStatusSchema } from "@niryat/shared";
export { type AgentTool, type ClaudeRunner, createClaudeRunner } from "./claude";
export {
  type CloseAgentInput,
  type CloseDataSource,
  type CloseDrafts,
  closeAgentTools,
  runCloseAgent,
  type ToolLog,
} from "./close-agent";
export { agentNoteSchema } from "./notes";
export {
  createToolkitReader,
  PAYPAL_READ_TOOLS,
  type PayPalReader,
  paypalReadTools,
} from "./paypal-tools";

// Agent-initiated PayPal actions must pass the user's approval queue (spec 08); only PAYPAL_READ_TOOLS skip it (AGENTS.md).
export type PayPalActionName = (typeof paypalActionNames)[number];

export interface ProposedAction {
  readonly id: string;
  readonly userId: string;
  readonly paypalAction: PayPalActionName;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: ActionStatus;
}

export interface ActionStore {
  claim(actionId: string, userId: string): Promise<ProposedAction | undefined>; // proposed|failed → approved, atomically
  finish(
    actionId: string,
    outcome: { status: "done" } | { status: "failed"; error: string },
  ): Promise<void>;
}

export type ActionHandler = (action: ProposedAction) => Promise<void>;

export async function runApprovedAction(
  store: ActionStore,
  handlers: Readonly<Record<PayPalActionName, ActionHandler>>,
  actionId: string,
  userId: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: "not_pending" }
  | { ok: false; reason: "failed"; error: string }
> {
  const action = await store.claim(actionId, userId);
  if (!action) return { ok: false, reason: "not_pending" };

  try {
    await handlers[action.paypalAction](action);
  } catch (error) {
    const parsed = z.object({ code: z.string() }).safeParse(error);
    const code = parsed.success ? parsed.data.code : "unexpected_error";
    await store.finish(actionId, { status: "failed", error: code });
    return { ok: false, reason: "failed", error: code };
  }

  await store.finish(actionId, { status: "done" });
  return { ok: true };
}
