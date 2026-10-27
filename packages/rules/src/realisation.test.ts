import { readFileSync } from "node:fs";
import { disputeAlertSchema, realisationSchema } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { cite } from "./cite";
import { parseRules, RULES_FILE_URL } from "./load";
import { disputeAlert, LOST_DISPUTE_OUTCOMES, realisationFor, refundTask } from "./realisation";

const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
const invoice = { number: "2026-27/0001", currency: "USD", amount: "100" };
const tail =
  " This reduces the export value only when your bank (AD bank) accepts it; for invoices up to Rs 10 lakh your declaration may be enough. Until then, treat it as unrealised.";

describe("realisation adjustment", () => {
  it.each([
    {
      paidTotal: "100",
      refundedTotal: "40",
      disputeLost: false,
      received: "60.00",
      shortfall: "40.00",
      adjustment: "pending_bank",
      message: `USD 40.00 of invoice 2026-27/0001 was refunded to the client.${tail}`,
    },
    {
      paidTotal: "0",
      refundedTotal: "0",
      disputeLost: false,
      received: "0.00",
      shortfall: "100.00",
      adjustment: "none",
      message: null,
    },
    {
      paidTotal: "100",
      refundedTotal: "0",
      disputeLost: true,
      received: "100.00",
      shortfall: "0.00",
      adjustment: "pending_bank",
      message: `The client won a dispute on invoice 2026-27/0001.${tail}`,
    },
    {
      paidTotal: "30",
      refundedTotal: "40",
      disputeLost: false,
      received: "0.00",
      shortfall: "100.00",
      adjustment: "pending_bank",
      message: `USD 40.00 of invoice 2026-27/0001 was refunded to the client.${tail}`,
    },
    {
      paidTotal: "100",
      refundedTotal: "40",
      disputeLost: true,
      received: "60.00",
      shortfall: "40.00",
      adjustment: "pending_bank",
      message: `USD 40.00 of invoice 2026-27/0001 was refunded to the client.${tail}`,
    },
    {
      paidTotal: "120.01",
      refundedTotal: "0",
      disputeLost: false,
      received: "120.01",
      shortfall: "0.00",
      adjustment: "none",
      message: null,
    },
    {
      paidTotal: "100",
      refundedTotal: "99.99",
      disputeLost: false,
      received: "0.01",
      shortfall: "99.99",
      adjustment: "pending_bank",
      message: `USD 99.99 of invoice 2026-27/0001 was refunded to the client.${tail}`,
    },
  ])("paid=$paidTotal refunded=$refundedTotal lost=$disputeLost", (row) => {
    const { paidTotal, refundedTotal, disputeLost, ...expected } = row;
    const result = realisationFor({ invoice, paidTotal, refundedTotal, disputeLost }, rules);
    expect(result).toEqual({
      exportValue: "100.00",
      ...expected,
      citation: cite(rules, "REALISATION_ADJUSTMENT"),
    });
    expect(realisationSchema.safeParse(result).success).toBe(true);
  });
});

describe("dispute alerts", () => {
  it("recognises exactly the two locked lost outcomes", () => {
    expect(LOST_DISPUTE_OUTCOMES).toEqual(["RESOLVED_BUYER_FAVOUR", "ACCEPTED"]);
  });

  it.each([
    {
      outcome: null,
      responseDueDate: "2026-11-10",
      lost: false,
      message:
        "Client disputed USD 50.00 on invoice 2026-27/0001. This export may no longer count as realised. Respond in PayPal by 2026-11-10.",
    },
    {
      outcome: null,
      responseDueDate: null,
      lost: false,
      message:
        "Client disputed USD 50.00 on invoice 2026-27/0001. This export may no longer count as realised.",
    },
    {
      outcome: "RESOLVED_BUYER_FAVOUR",
      responseDueDate: "2026-11-10",
      lost: true,
      message:
        "PayPal resolved the dispute on invoice 2026-27/0001 in the buyer's favour. The export value is reduced only when your bank (AD bank) accepts it. Ask your bank to record the reduction.",
    },
    {
      outcome: "ACCEPTED",
      responseDueDate: null,
      lost: true,
      message:
        "PayPal resolved the dispute on invoice 2026-27/0001 in the buyer's favour. The export value is reduced only when your bank (AD bank) accepts it. Ask your bank to record the reduction.",
    },
    {
      outcome: "RESOLVED_SELLER_FAVOUR",
      responseDueDate: "2026-11-10",
      lost: false,
      message:
        "PayPal resolved the dispute on invoice 2026-27/0001 in your favour. The export value does not change.",
    },
  ])("outcome=$outcome due=$responseDueDate", ({ outcome, responseDueDate, lost, message }) => {
    const result = disputeAlert(
      {
        invoiceNumber: invoice.number,
        paypalDisputeId: "DISPUTE-1",
        amount: "50",
        currency: "USD",
        responseDueDate,
        outcome,
      },
      rules,
    );
    expect(result).toEqual({
      paypalDisputeId: "DISPUTE-1",
      lost,
      message,
      citation: cite(rules, "REALISATION_ADJUSTMENT"),
    });
    expect(disputeAlertSchema.safeParse(result).success).toBe(true);
  });
});

describe("refund task messages", () => {
  it.each([
    { gstRegistered: true, date: "2026-10-27", creditNote: true },
    { gstRegistered: true, date: "2027-11-30", creditNote: true },
    { gstRegistered: true, date: "2027-12-01", creditNote: false },
    { gstRegistered: false, date: "2026-10-27", creditNote: false },
    { gstRegistered: null, date: "2026-10-27", creditNote: false },
  ])("registered=$gstRegistered date=$date", ({ gstRegistered, date, creditNote }) => {
    expect(
      refundTask(
        {
          gstRegistered,
          invoice: { ...invoice, date: "2026-10-26" },
          refund: { date, amount: "40" },
        },
        rules,
      ),
    ).toEqual({
      message: creditNote
        ? "Refund of USD 40.00 recorded on invoice 2026-27/0001. Consider issuing a GST credit note (declare it by 2027-11-30), and ask your bank (AD bank) to accept the reduced export value."
        : "Refund of USD 40.00 recorded on invoice 2026-27/0001. Ask your bank (AD bank) to accept the reduced export value.",
      dueDate: creditNote ? "2027-11-30" : null,
      sourceRuleId: creditNote ? "CREDIT_NOTE" : "REALISATION_ADJUSTMENT",
    });
  });
});
