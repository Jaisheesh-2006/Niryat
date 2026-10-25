import { readFileSync } from "node:fs";
import {
  type ExportAnswers,
  type ExportCheckResult,
  exportCheckResultSchema,
} from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { checkExportConditions } from "./export-conditions";
import { parseRules, RULES_FILE_URL } from "./load";

const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
const today = "2026-10-26";
const answers: ExportAnswers = {
  supplierInIndia: true,
  clientPresentInIndia: false,
  paidInForeignCurrency: true,
  sameEstablishment: false,
};

describe("export conditions", () => {
  it("passes all five conditions in order for an eligible US client", () => {
    const result = checkExportConditions({ country: "US", answers }, { today, rules });
    expect(result.eligible).toBe(true);
    expect(result.conditions).toEqual([
      {
        id: "supplier_in_india",
        status: "pass",
        reference: "IGST Act 2017, s. 2(6)(i)",
        message: "You supply the service from India.",
      },
      {
        id: "recipient_outside_india",
        status: "pass",
        reference: "IGST Act 2017, s. 2(6)(ii)",
        message: "The client is located outside India (US).",
      },
      {
        id: "place_of_supply_outside_india",
        status: "pass",
        reference: "IGST Act 2017, s. 2(6)(iii), s. 13(2)-(3)",
        message: "The place of supply is the client's location, outside India.",
      },
      {
        id: "foreign_exchange",
        status: "pass",
        reference: "IGST Act 2017, s. 2(6)(iv)",
        message: "Paid in convertible foreign exchange.",
      },
      {
        id: "not_same_person",
        status: "pass",
        reference: "IGST Act 2017, s. 2(6)(v)",
        message: "The client is a separate business, not your own establishment.",
      },
    ]);
    expect(exportCheckResultSchema.parse(result)).toEqual(result);
    expect(result.citation).toEqual({
      ruleId: "EXPORT_CONDITIONS",
      source: rules[0]?.source,
      effectiveFrom: "2019-02-01",
    });
    expect(result.checkedOn).toBe(today);
  });

  it.each([false, true, null])(
    "fails both India conditions regardless of physical presence (%s)",
    (clientPresentInIndia) => {
      const result = checkExportConditions(
        { country: "IN", answers: { ...answers, clientPresentInIndia } },
        { today, rules },
      );
      expect(result.eligible).toBe(false);
      expect(result.conditions.filter((condition) => condition.status !== "pass")).toEqual([
        {
          id: "recipient_outside_india",
          status: "fail",
          reference: "IGST Act 2017, s. 2(6)(ii)",
          message: "The client is in India. PayPal also blocks invoices to India-based recipients.",
        },
        {
          id: "place_of_supply_outside_india",
          status: "fail",
          reference: "IGST Act 2017, s. 2(6)(iii), s. 13(2)-(3)",
          message: "The client is in India, so the place of supply is India.",
        },
      ]);
    },
  );

  it.each<{
    name: string;
    changes: Partial<ExportAnswers>;
    condition: Pick<ExportCheckResult["conditions"][number], "id" | "status" | "message">;
  }>([
    {
      name: "supplier outside India",
      changes: { supplierInIndia: false },
      condition: {
        id: "supplier_in_india",
        status: "fail",
        message: "You do not supply this service from India, so it is not an export from India.",
      },
    },
    {
      name: "physical presence in India",
      changes: { clientPresentInIndia: true },
      condition: {
        id: "place_of_supply_outside_india",
        status: "fail",
        message:
          "Work that needs the client physically present in India is supplied where it is performed, which is India.",
      },
    },
    {
      name: "payment in Indian rupees needs confirmation",
      changes: { paidInForeignCurrency: false },
      condition: {
        id: "foreign_exchange",
        status: "unknown",
        message:
          "Payment in Indian rupees counts only where the RBI permits it. Confirm with your bank or CA.",
      },
    },
    {
      name: "same establishment",
      changes: { sameEstablishment: true },
      condition: {
        id: "not_same_person",
        status: "fail",
        message: "Payments between establishments of the same person are not an export.",
      },
    },
  ])("blocks eligibility for $name", ({ changes, condition }) => {
    const result = checkExportConditions(
      { country: "US", answers: { ...answers, ...changes } },
      { today, rules },
    );
    expect(result.eligible).toBe(false);
    expect(result.conditions.filter((entry) => entry.status !== "pass")).toEqual([
      expect.objectContaining(condition),
    ]);
    expect(exportCheckResultSchema.parse(result)).toEqual(result);
  });

  it("leaves four conditions unknown when all answers are missing", () => {
    const result = checkExportConditions(
      {
        country: "US",
        answers: {
          supplierInIndia: null,
          clientPresentInIndia: null,
          paidInForeignCurrency: null,
          sameEstablishment: null,
        },
      },
      { today, rules },
    );
    expect(result.eligible).toBe(false);
    expect(result.conditions).toMatchObject([
      {
        id: "supplier_in_india",
        status: "unknown",
        message: "Answer: do you supply this service from India?",
      },
      { id: "recipient_outside_india", status: "pass" },
      {
        id: "place_of_supply_outside_india",
        status: "unknown",
        message:
          "Answer: does this work need the client to be physically present with you in India?",
      },
      {
        id: "foreign_exchange",
        status: "unknown",
        message: "Answer: will the client pay in foreign currency?",
      },
      {
        id: "not_same_person",
        status: "unknown",
        message: "Answer: is the client your own branch or establishment?",
      },
    ]);
    expect(exportCheckResultSchema.parse(result)).toEqual(result);
  });
});
