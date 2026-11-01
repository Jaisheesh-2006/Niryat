import {
  type Action,
  type ActionStatus,
  actionSchema,
  actionStatusSchema,
  firaStatuses,
  invoiceStatuses,
  paypalActionNames,
} from "@niryat/shared";
import { expect, it } from "vitest";
import {
  actionStatusLabel,
  actionTone,
  approvalKind,
  approvalTitle,
  invoiceFira,
  invoiceStatus,
  type Tone,
} from "./status";

function action(paypalAction: Action["paypalAction"], payload: Action["payload"] = {}): Action {
  return actionSchema.parse({
    id: "10000000-0000-4000-8000-000000000001",
    paymentId: null,
    paypalAction,
    status: "proposed",
    payload,
    error: null,
    createdAt: "2026-11-01T00:00:00Z",
  });
}

it("covers every invoice and FIRA status with the existing labels and specified tones", () => {
  expect(Object.keys(invoiceStatus)).toEqual(invoiceStatuses);
  expect(invoiceStatus).toEqual({
    issued: { label: "Issued", tone: "neutral" },
    sent: { label: "Sent through PayPal", tone: "neutral" },
    partially_paid: { label: "Partly paid", tone: "attention" },
    paid: { label: "Paid", tone: "success" },
    partially_refunded: { label: "Partly refunded", tone: "attention" },
    refunded: { label: "Refunded", tone: "neutral" },
  });
  expect(Object.keys(invoiceFira)).toEqual(firaStatuses);
  expect(invoiceFira).toEqual({
    matched: { label: "Matched to FIRA", tone: "success" },
    pending: { label: "Pending", tone: "neutral" },
    missing: { label: "Missing from FIRA", tone: "danger" },
  });
});

it.each(actionStatusSchema.options)("labels and tones approval status %s", (status) => {
  const expected: Record<ActionStatus, { label: string; tone: Tone }> = {
    proposed: { label: "Waiting for your approval", tone: "attention" },
    approved: { label: "Sending…", tone: "neutral" },
    rejected: { label: "Rejected", tone: "neutral" },
    done: { label: "Done", tone: "success" },
    failed: { label: "Failed", tone: "danger" },
  };
  expect(actionTone(status)).toBe(expected[status].tone);
  expect(actionStatusLabel(status)).toBe(expected[status].label);
});

it.each(paypalActionNames)("titles PayPal action %s from the supplied invoice fields", (name) => {
  const expected: Record<Action["paypalAction"], string> = {
    send_invoice: "Send invoice INV-0007 to Acme through PayPal",
    create_recurring_series: "Start the PayPal recurring series for invoice INV-0007",
    refund_payment: "Refund a payment on invoice INV-0007 through PayPal",
    send_invoice_reminder: "Send PayPal's standard reminder for invoice INV-0007",
  };
  expect(
    approvalTitle({ action: action(name), invoiceNumber: "INV-0007", clientName: "Acme" }),
  ).toBe(expected[name]);
  if (name !== "send_invoice_reminder") expect(approvalKind(action(name))).toBeUndefined();
});

it.each([30, 60])("labels the validated %i-day reminder stage", (stage) => {
  const reminder = action("send_invoice_reminder", { stage });
  expect(approvalKind(reminder)).toBe(`Reminder · ${stage}-day stage`);
  expect(approvalTitle({ action: reminder, invoiceNumber: "INV-0007" })).toBe(
    "Send PayPal's standard reminder for invoice INV-0007",
  );
});

it.each([45, "30", null, undefined])("rejects invalid reminder stage %j", (stage) => {
  expect(() => approvalKind(action("send_invoice_reminder", { stage }))).toThrow();
});
