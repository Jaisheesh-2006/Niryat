import {
  type Action,
  type ActionStatus,
  type FiraStatus,
  type Invoice,
  reminderStageSchema,
} from "@niryat/shared";

export type Tone = "success" | "attention" | "danger" | "neutral";

export const invoiceStatus: Record<Invoice["status"], { label: string; tone: Tone }> = {
  issued: { label: "Issued", tone: "neutral" },
  sent: { label: "Sent through PayPal", tone: "neutral" },
  partially_paid: { label: "Partly paid", tone: "attention" },
  paid: { label: "Paid", tone: "success" },
  partially_refunded: { label: "Partly refunded", tone: "attention" },
  refunded: { label: "Refunded", tone: "neutral" },
};

export const invoiceFira: Record<FiraStatus, { label: string; tone: Tone }> = {
  matched: { label: "Matched to FIRA", tone: "success" },
  pending: { label: "Pending", tone: "neutral" },
  missing: { label: "Missing from FIRA", tone: "danger" },
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
