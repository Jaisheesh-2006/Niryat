import type { ExportAnswers, ExportCheckResult } from "@niryat/shared";
import { cite } from "./cite";
import type { RuleMetadata } from "./index";

export function checkExportConditions(
  input: { country: string; answers: ExportAnswers },
  options: { today: string; rules: readonly RuleMetadata[] },
): ExportCheckResult {
  const { country, answers } = input;
  const { today, rules } = options;
  // shortcut: only the s. 13(3) physical-presence exception is asked; add other s. 13 exceptions if a user's work needs them.
  const conditions: ExportCheckResult["conditions"] = [
    {
      id: "supplier_in_india",
      reference: "IGST Act 2017, s. 2(6)(i)",
      status:
        answers.supplierInIndia === null ? "unknown" : answers.supplierInIndia ? "pass" : "fail",
      message:
        answers.supplierInIndia === null
          ? "Answer: do you supply this service from India?"
          : answers.supplierInIndia
            ? "You supply the service from India."
            : "You do not supply this service from India, so it is not an export from India.",
    },
    {
      id: "recipient_outside_india",
      reference: "IGST Act 2017, s. 2(6)(ii)",
      status: country === "IN" ? "fail" : "pass",
      message:
        country === "IN"
          ? "The client is in India. PayPal also blocks invoices to India-based recipients."
          : `The client is located outside India (${country}).`,
    },
    {
      id: "place_of_supply_outside_india",
      reference: "IGST Act 2017, s. 2(6)(iii), s. 13(2)-(3)",
      status:
        country === "IN" || answers.clientPresentInIndia === true
          ? "fail"
          : answers.clientPresentInIndia === null
            ? "unknown"
            : "pass",
      message:
        country === "IN"
          ? "The client is in India, so the place of supply is India."
          : answers.clientPresentInIndia === true
            ? "Work that needs the client physically present in India is supplied where it is performed, which is India."
            : answers.clientPresentInIndia === null
              ? "Answer: does this work need the client to be physically present with you in India?"
              : "The place of supply is the client's location, outside India.",
    },
    {
      id: "foreign_exchange",
      reference: "IGST Act 2017, s. 2(6)(iv)",
      status: answers.paidInForeignCurrency === true ? "pass" : "unknown",
      message:
        answers.paidInForeignCurrency === true
          ? "Paid in convertible foreign exchange."
          : answers.paidInForeignCurrency === false
            ? "Payment in Indian rupees counts only where the RBI permits it. Confirm with your bank or CA."
            : "Answer: will the client pay in foreign currency?",
    },
    {
      id: "not_same_person",
      reference: "IGST Act 2017, s. 2(6)(v)",
      status:
        answers.sameEstablishment === null
          ? "unknown"
          : answers.sameEstablishment
            ? "fail"
            : "pass",
      message:
        answers.sameEstablishment === null
          ? "Answer: is the client your own branch or establishment?"
          : answers.sameEstablishment
            ? "Payments between establishments of the same person are not an export."
            : "The client is a separate business, not your own establishment.",
    },
  ];

  return {
    eligible: conditions.every((condition) => condition.status === "pass"),
    conditions,
    citation: cite(rules, "EXPORT_CONDITIONS"),
    checkedOn: today,
  };
}
