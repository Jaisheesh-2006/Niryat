import { readFileSync } from "node:fs";
import { BANK_NOTE, CA_NOTE } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import {
  checkPurposeCode,
  cite,
  PAYPAL_INDIA_PURPOSE_CODES,
  PURPOSE_CODE_HINTS,
  parseRules,
  RULES_FILE_URL,
  suggestPurposeCode,
} from "./index";

const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));

describe("purpose-code suggestions", () => {
  it.each([
    { input: "Software development for a US startup", code: "P0802" },
    { input: "Full stack web development", code: "P0802" },
    { input: "SEO and social media marketing", code: "P1007" },
    { input: "Bookkeeping and tax filing", code: "P1005" },
    { input: "Business strategy consulting", code: "P1006" },
    { input: "Market research surveys", code: "P1007", reason: "P1016" },
    { input: "R&D services", code: "P1008" },
    { input: "Structural engineering drawings", code: null, reason: "P1014" },
    { input: "Software and marketing", code: null, reason: "more than one service" },
    { input: "Pottery", code: null, reason: "could not match" },
    { input: "", code: null, reason: "could not match" },
    { input: "Newsletter and taxidermy", code: null, reason: "could not match" },
    { input: "Software, website and marketing", code: "P0802" },
    {
      input: "Software software software and marketing",
      code: null,
      reason: "more than one service",
    },
  ])("$input => $code", ({ input, code, reason }) => {
    const result = suggestPurposeCode(input);
    expect(result.code).toBe(code);
    expect(result.label).toBe(
      PAYPAL_INDIA_PURPOSE_CODES.find((entry) => entry.code === code)?.paypalLabel ?? null,
    );
    expect(result.note).toBe(BANK_NOTE);
    if (reason) expect(result.reason).toContain(reason);
  });

  it("keeps the fourteen offered codes in table order", () => {
    expect(PAYPAL_INDIA_PURPOSE_CODES.map(({ code }) => code)).toEqual([
      "P0104",
      "P0301",
      "P0801",
      "P0802",
      "P0803",
      "P0805",
      "P0806",
      "P0902",
      "P1004",
      "P1005",
      "P1006",
      "P1007",
      "P1008",
      "P1009",
    ]);
  });

  it.each(PURPOSE_CODE_HINTS)("suggests only an allowed service code: $code", (hint) => {
    if (hint.code !== null) {
      expect(PAYPAL_INDIA_PURPOSE_CODES.find(({ code }) => code === hint.code)?.suggest).toBe(
        "yes",
      );
    }
    for (const keyword of hint.keywords) {
      expect(keyword).toMatch(/^[a-z0-9 &-]+$/);
      expect(suggestPurposeCode(keyword)).toEqual({
        code: hint.code,
        label:
          PAYPAL_INDIA_PURPOSE_CODES.find(({ code }) => code === hint.code)?.paypalLabel ?? null,
        reason: hint.reason,
        note: BANK_NOTE,
      });
    }
  });
});

describe("purpose-code profile flags", () => {
  const missingCode = {
    code: "purpose_code_missing",
    severity: "medium",
    message: "No purpose code saved. Add the purpose code set in your PayPal account.",
  };
  const missingWork = {
    code: "work_type_missing",
    severity: "low",
    message: "Describe your work so we can check your purpose code.",
  };

  it.each([
    { purposeCode: "P0802", workType: "software", expected: [] },
    {
      purposeCode: "P1006",
      workType: "Software development",
      expected: [
        {
          code: "purpose_code_mismatch",
          severity: "medium",
          message:
            "Your work looks like P0802 (Software consulting), but your purpose code is P1006 (Business and management consultancy).",
        },
      ],
    },
    { purposeCode: null, workType: "software", expected: [missingCode] },
    {
      purposeCode: "P0104",
      workType: "software",
      expected: [
        {
          code: "purpose_code_goods_or_travel",
          severity: "high",
          message:
            "P0104 (Cross border delivery of goods and services) is not a services code. Its RBI description is: Receipts against export of goods not covered by GR/PP/SOFTEX/EC copy of shipping bill (intermediary/transit trade)",
        },
      ],
    },
    {
      purposeCode: "P0301",
      workType: "software",
      expected: [
        {
          code: "purpose_code_goods_or_travel",
          severity: "high",
          message:
            "P0301 (Business related travel purchase) is not a services code. Its RBI description is: Purchases towards travel (TCs, currency notes, TT/SWIFT transfers)",
        },
      ],
    },
    {
      purposeCode: "P9999",
      workType: "software",
      expected: [
        {
          code: "purpose_code_not_offered",
          severity: "high",
          message: "P9999 is not one of the purpose codes PayPal India offers.",
        },
      ],
    },
    { purposeCode: "P1006", workType: null, expected: [missingWork] },
    { purposeCode: "P1006", workType: "Software and marketing", expected: [] },
    { purposeCode: "P1006", workType: "Pottery", expected: [] },
    { purposeCode: "P1006", workType: "Structural engineering drawings", expected: [] },
    { purposeCode: "P0806", workType: "Pottery", expected: [] },
    { purposeCode: null, workType: null, expected: [missingCode, missingWork] },
  ])("$purposeCode + $workType", ({ purposeCode, workType, expected }) => {
    const purposeRule = rules.find(({ id }) => id === "PURPOSE_CODES");
    expect(checkPurposeCode({ purposeCode, workType }, rules)).toEqual(
      expected.map((expectedFlag) => ({
        ...expectedFlag,
        citation: {
          ruleId: "PURPOSE_CODES",
          source: purposeRule?.source,
          effectiveFrom: purposeRule?.effective_from,
        },
        note: CA_NOTE,
      })),
    );
  });
});

describe("rule citations", () => {
  it("copies the rule source and effective date", () => {
    const [rule] = rules;
    if (!rule) throw new Error("Rules fixture is empty");
    expect(cite(rules, rule.id)).toEqual({
      ruleId: rule.id,
      source: rule.source,
      effectiveFrom: rule.effective_from,
    });
  });

  it("rejects an unknown rule id", () => {
    expect(() => cite(rules, "NOPE")).toThrow("Unknown rule id: NOPE");
  });
});
