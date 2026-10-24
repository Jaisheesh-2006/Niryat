import { z } from "zod";

// TODO: Claude Agent SDK + PayPal Agent Toolkit adapters; no SDK calls in scaffold.
// All PayPal actions, including reads, must pass the user's approval queue.
export const actionStatusSchema = z.enum(["proposed", "approved", "rejected", "done"]);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

export interface ProposedAction {
  readonly id: string;
  readonly userId: string;
  readonly paypalAction: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: ActionStatus;
}

export interface ApprovalQueue {
  propose(action: Omit<ProposedAction, "id" | "status">): Promise<ProposedAction>;
  approve(actionId: string, userId: string): Promise<void>;
  reject(actionId: string, userId: string): Promise<void>;
  // Implementations must atomically check user ownership and approval before execution.
  executeApproved(actionId: string, userId: string): Promise<void>;
}
