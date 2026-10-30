import { randomUUID } from "node:crypto";
import * as storage from "@niryat/db";
import type { Invoice, InvoiceView } from "@niryat/shared";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { toInvoiceView } from "./compliance";
import { buildReminderPayload, proposeReminders, reminderCandidates } from "./reminders";

const candidate = {
  invoiceId: randomUUID(),
  invoiceNumber: "2026-27/0001",
  stage: 60 as const,
  paypalInvoiceId: "INV2-TEST",
};
const advice = {
  advice: "hold" as const,
  reason: "The client has an open dispute on this invoice.",
};
const key = `reminder:${candidate.invoiceId}:60`;
const remind = { send_to_invoicer: false, send_to_recipient: true };
const { db, close } = storage.createDb("postgresql://unused@127.0.0.1/unused");

function view(): InvoiceView {
  const invoice: Invoice = {
    id: candidate.invoiceId,
    clientId: randomUUID(),
    clientName: "Synthetic Client",
    type: "one_time",
    number: candidate.invoiceNumber,
    fy: "2026-27",
    date: "2026-10-26",
    currency: "USD",
    amount: "100.00",
    description: "Software development",
    sac: "998314",
    recurrence: null,
    status: "sent",
    pdfUrl: null,
    paypalInvoiceId: candidate.paypalInvoiceId,
    paypalRecurringSeriesId: null,
    paidTotal: "0.00",
    payments: [],
    firaStatus: "pending",
    refundedTotal: "0.00",
    refunds: [],
    disputes: [],
    action: null,
    refundActions: [],
  };
  return toInvoiceView(invoice, true, "2027-06-01");
}

afterEach(() => vi.restoreAllMocks());
afterAll(close);

it("selects only unpaid sent/part-paid candidates with a due stage and no existing key", () => {
  const eligible = view();
  expect(reminderCandidates([eligible], new Set())).toEqual([candidate]);
  expect(reminderCandidates([eligible], new Set([key]))).toEqual([]);
  expect(reminderCandidates([{ ...eligible, status: "partially_paid" }], new Set())).toEqual([
    candidate,
  ]);
  for (const status of ["issued", "paid", "partially_refunded", "refunded"] as const) {
    expect(reminderCandidates([{ ...eligible, status }], new Set())).toEqual([]);
  }
  expect(reminderCandidates([{ ...eligible, paypalInvoiceId: null }], new Set())).toEqual([]);
  expect(
    reminderCandidates(
      [{ ...eligible, compliance: { ...eligible.compliance, deadline: null } }],
      new Set(),
    ),
  ).toEqual([]);
  const deadline = eligible.compliance.deadline;
  if (!deadline) throw new Error("Expected deadline");
  for (const change of [{ stage: null }, { overdue: true }]) {
    expect(
      reminderCandidates(
        [
          {
            ...eligible,
            compliance: { ...eligible.compliance, deadline: { ...deadline, ...change } },
          },
        ],
        new Set(),
      ),
    ).toEqual([]);
  }
  expect(
    reminderCandidates(
      [
        {
          ...eligible,
          compliance: { ...eligible.compliance, deadline: { ...deadline, stage: 30 } },
        },
      ],
      new Set(),
    ),
  ).toEqual([{ ...candidate, stage: 30 }]);
});

it.each([null, advice])(
  "builds the exact immutable standard-reminder payload with advice %j",
  (agent) => {
    expect(buildReminderPayload(candidate, agent)).toEqual({
      invoiceId: candidate.invoiceId,
      stage: 60,
      paypalInvoiceId: candidate.paypalInvoiceId,
      agent,
      remind,
    });
  },
);

it.each([null, advice])(
  "persists advice or its fallback and counts an existing proposal: %j",
  async (agent) => {
    const save = vi
      .spyOn(storage, "proposeReminder")
      .mockResolvedValueOnce({ ok: true, actionId: "action-id" })
      .mockResolvedValueOnce({ ok: false, reason: "exists" });
    const drafts = new Map(agent ? [[key, agent]] : []);
    expect(await proposeReminders({ db }, "user-id", [candidate], drafts)).toEqual({
      proposed: [
        { actionId: "action-id", invoiceNumber: candidate.invoiceNumber, stage: 60, advice: agent },
      ],
      existing: 0,
    });
    expect(save).toHaveBeenCalledWith(db, "user-id", {
      invoiceId: candidate.invoiceId,
      dedupeKey: key,
      payload: buildReminderPayload(candidate, agent),
    });
    expect(await proposeReminders({ db }, "user-id", [candidate], drafts)).toEqual({
      proposed: [],
      existing: 1,
    });
  },
);

it("does not report missing ownership or storage failure as deduplication", async () => {
  const save = vi
    .spyOn(storage, "proposeReminder")
    .mockResolvedValueOnce({ ok: false, reason: "not_found" });
  await expect(proposeReminders({ db }, "other-user", [candidate], new Map())).rejects.toThrow(
    "Reminder invoice not found",
  );
  save.mockRejectedValueOnce(new Error("Reminder proposal save failed"));
  await expect(proposeReminders({ db }, "user-id", [candidate], new Map())).rejects.toThrow(
    "Reminder proposal save failed",
  );
});
