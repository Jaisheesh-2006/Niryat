import {
  type Action,
  type ActionStatus,
  type AgentRun,
  type FiraStatus,
  type HealthFlag,
  type Invoice,
  reminderStageSchema,
} from "@niryat/shared";

export type Tone = "success" | "attention" | "danger" | "neutral";

export const agentActor: Record<AgentRun["toolCalls"][number]["actor"], string> = {
  agent: "Claude",
  system: "Niryat",
};

const agentToolLabels: ReadonlyMap<string, string> = new Map([
  ["get_invoice", "Read a PayPal invoice"],
  ["paypal_get_invoice", "Read a PayPal invoice"],
  ["list_invoices", "Read PayPal invoices"],
  ["paypal_list_invoices", "Read PayPal invoices"],
  ["get_dispute", "Read a PayPal dispute"],
  ["paypal_get_dispute", "Read a PayPal dispute"],
  ["list_disputes", "Read PayPal disputes"],
  ["paypal_list_disputes", "Read PayPal disputes"],
  ["list_transactions", "Read PayPal transactions"],
  ["paypal_list_transactions", "Read PayPal transactions"],
  ["list_open_invoices", "Read unpaid invoices"],
  ["get_client_history", "Read a client's history"],
  ["list_open_disputes", "Read open disputes"],
  ["get_month_overview", "Read the month's overview"],
  ["list_fira_issues", "Read payment proof issues"],
  ["propose_reminder", "Drafted a reminder for your approval"],
  ["suggest_task", "Suggested a task"],
  ["write_summary", "Wrote the summary"],
]);

export function agentToolLabel(tool: string): string {
  return agentToolLabels.get(tool) ?? tool;
}

// `order` puts the most urgent flags first.
export const healthSeverity: Record<
  HealthFlag["severity"],
  { label: string; tone: Tone; order: number }
> = {
  high: { label: "Act now", tone: "danger", order: 0 },
  medium: { label: "Needs attention", tone: "attention", order: 1 },
  low: { label: "Plan ahead", tone: "neutral", order: 2 },
};

export const invoiceStatus: Record<Invoice["status"], { label: string; tone: Tone }> = {
  issued: { label: "Prepared", tone: "neutral" },
  sent: { label: "Sent through PayPal", tone: "neutral" },
  partially_paid: { label: "Partly paid", tone: "attention" },
  paid: { label: "Paid", tone: "success" },
  partially_refunded: { label: "Partly refunded", tone: "attention" },
  refunded: { label: "Refunded", tone: "neutral" },
};

export const invoiceFira: Record<FiraStatus, { label: string; tone: Tone }> = {
  matched: { label: "Payment proof matched", tone: "success" },
  pending: { label: "Payment proof not yet matched", tone: "neutral" },
  missing: { label: "Payment proof missing", tone: "danger" },
};

const actionStatus: Record<ActionStatus, { label: string; tone: Tone }> = {
  proposed: { label: "Waiting for your approval", tone: "attention" },
  approved: { label: "Sending…", tone: "neutral" },
  rejected: { label: "Rejected", tone: "neutral" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function actionTone(status: ActionStatus): Tone {
  return actionStatus[status].tone;
}

export function actionStatusLabel(status: ActionStatus): string {
  return actionStatus[status].label;
}

export function approvalTitle({
  action,
  invoiceNumber,
  clientName,
}: {
  action: Action;
  invoiceNumber: string;
  clientName?: string;
}): string {
  const titles: Record<Action["paypalAction"], string> = {
    send_invoice: `Send invoice ${invoiceNumber} to ${clientName} through PayPal`,
    create_recurring_series: `Start the PayPal recurring series for invoice ${invoiceNumber}`,
    refund_payment: `Refund a payment on invoice ${invoiceNumber} through PayPal`,
    send_invoice_reminder: `Send PayPal's standard reminder for invoice ${invoiceNumber}`,
  };
  return titles[action.paypalAction];
}

export function approvalKind(action: Action): string | undefined {
  if (action.paypalAction === "send_invoice_reminder") {
    return `Reminder · ${reminderStageSchema.parse(action.payload.stage)}-day stage`;
  }
  return undefined;
}
