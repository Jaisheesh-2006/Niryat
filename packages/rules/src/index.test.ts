import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as rulesModule from "./index";
import { parseRules, RULES_FILE_URL, ruleMetadataSchema } from "./index";

const IMPLEMENTED: Record<string, string> = {
  EXPORT_CONDITIONS: "checkExportConditions",
  PURPOSE_CODES: "checkPurposeCode",
  LUT_REQUIRED: "checkLut",
  GST_THRESHOLD: "checkGstThreshold",
  INVOICE_NUMBERING: "invoiceNumberFor",
  EXPORT_INVOICE_FIELDS: "prepareExportInvoice",
};

describe("rule metadata table-driven pattern (no tax logic)", () => {
  it.each([
    { id: "EXPORT_CONDITIONS", review: "source_checked", valid: true },
    { id: "PURPOSE_CODES", review: "unchecked", valid: true },
    { id: "invalid-id", review: "source_checked", valid: false },
    { id: "LUT_REQUIRED", review: "ca_reviewed", valid: false },
  ])("$id with review=$review => $valid", ({ id, review, valid }) => {
    expect(
      ruleMetadataSchema.safeParse({
        id,
        review,
        description: "Placeholder",
        source: "docs/rules-sources.md",
        effective_from: null,
        logic: "TODO",
      }).success,
    ).toBe(valid);
  });
  it.each([
    { logic: "checkLut", valid: true },
    { logic: "Bad-name", valid: false },
  ])("logic=$logic => $valid", ({ logic, valid }) => {
    expect(
      ruleMetadataSchema.safeParse({
        id: "LUT_REQUIRED",
        description: "Placeholder",
        source: "docs/rules-sources.md",
        effective_from: null,
        review: "source_checked",
        logic,
      }).success,
    ).toBe(valid);
  });

  it("gives all twelve planned rules a review status and the expected logic pointer", () => {
    const yaml = readFileSync(new URL("../rules/india-export.yaml", import.meta.url), "utf8");
    expect(yaml.match(/review: (unchecked|source_checked)/g)).toHaveLength(12);
    expect(yaml.match(/logic: /g)).toHaveLength(12);
    for (const rule of parseRules(yaml)) {
      expect(rule.logic).toBe(IMPLEMENTED[rule.id] ?? "TODO");
      if (rule.logic !== "TODO")
        expect(rulesModule).toHaveProperty(rule.logic, expect.any(Function));
    }
  });
});

describe("rules loader", () => {
  const yamlText = readFileSync(RULES_FILE_URL, "utf8");

  it("loads the twelve rules in order with their recorded review status and logic pointer", () => {
    const rules = parseRules(yamlText);
    expect(rules.map((rule) => rule.id)).toEqual([
      "EXPORT_CONDITIONS",
      "LUT_REQUIRED",
      "EXPORT_INVOICE_FIELDS",
      "INVOICE_NUMBERING",
      "CREDIT_NOTE",
      "GST_THRESHOLD",
      "GSTR1_6A",
      "PURPOSE_CODES",
      "RBI_REALISATION",
      "REALISATION_ADJUSTMENT",
      "PRESUMPTIVE_TAX",
      "ADVANCE_TAX_DATES",
    ]);
    for (const rule of rules) {
      expect(rule.logic).toBe(IMPLEMENTED[rule.id] ?? "TODO");
      if (rule.logic !== "TODO")
        expect(rulesModule).toHaveProperty(rule.logic, expect.any(Function));
      expect(rule.review).toBe("source_checked");
    }
  });

  it("rejects duplicate rule ids", () => {
    expect(() => parseRules(yamlText.replace("id: LUT_REQUIRED", "id: EXPORT_CONDITIONS"))).toThrow(
      "Duplicate rule id: EXPORT_CONDITIONS",
    );
  });

  it("reports invalid field paths without their values", () => {
    expect(() =>
      parseRules(yamlText.replace("review: source_checked", "review: ca_reviewed")),
    ).toThrow(/^Rules file is invalid: rules\.0\.review$/);
  });

  it("rejects malformed YAML without exposing its contents", () => {
    expect(() => parseRules("rules: [\n")).toThrow(/^Rules file is invalid: rules$/);
  });

  it.each([
    ["empty rules", "rules: []"],
    ["missing rules", "{}"],
    ["null rules", "rules: null"],
    ["unknown root field", `${yamlText}\nextra: true`],
  ])("rejects %s", (_name, input) => {
    expect(() => parseRules(input)).toThrow("Rules file is invalid");
  });
});
