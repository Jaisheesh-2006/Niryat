import { readFileSync } from "node:fs";
import { type HealthFlag, healthReportSchema, type ProfileInput } from "@niryat/shared";
import { describe, expect, it } from "vitest";
import { checkGstThreshold, checkLut, evaluateHealth } from "./health";
import { parseRules, RULES_FILE_URL } from "./load";

const rules = parseRules(readFileSync(RULES_FILE_URL, "utf8"));
const today = "2026-10-26";
const profile: ProfileInput = {
  legalName: "Ananya Rao",
  address: "12 MG Road, Pune 411001",
  gstRegistered: true,
  gstin: "27ABCDE1234F1Z5",
  lutNumber: "AD271026000001",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: "Software development",
  purposeCode: "P0802",
  panLast4: "234F",
  expectedTurnoverInr: 1_800_000,
};

describe("LUT validity", () => {
  const missing: Pick<HealthFlag, "code" | "severity" | "message"> = {
    code: "lut_missing",
    severity: "high",
    message:
      "No LUT on file. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund.",
  };

  it.each<{
    name: string;
    changes: Partial<ProfileInput>;
    expected: Pick<HealthFlag, "code" | "severity" | "message">[];
  }>([
    { name: "valid LUT", changes: {}, expected: [] },
    { name: "missing number", changes: { lutNumber: null }, expected: [missing] },
    { name: "missing start", changes: { lutValidFrom: null }, expected: [missing] },
    { name: "missing end", changes: { lutValidTo: null }, expected: [missing] },
    {
      name: "missing takes precedence over expired",
      changes: { lutNumber: null, lutValidTo: "2026-10-25" },
      expected: [missing],
    },
    {
      name: "future start",
      changes: { lutValidFrom: "2026-11-01" },
      expected: [
        {
          code: "lut_not_started",
          severity: "high",
          message: "Your LUT is valid only from 2026-11-01. Exports before then are not covered.",
        },
      ],
    },
    { name: "starts today", changes: { lutValidFrom: today }, expected: [] },
    {
      name: "30 days left",
      changes: { lutValidTo: "2026-11-25" },
      expected: [
        {
          code: "lut_expiring",
          severity: "low",
          message: "Your LUT expires on 2026-11-25. File a new LUT for the next financial year.",
        },
      ],
    },
    { name: "31 days left", changes: { lutValidTo: "2026-11-26" }, expected: [] },
    {
      name: "ends today",
      changes: { lutValidTo: today },
      expected: [
        {
          code: "lut_expiring",
          severity: "low",
          message: "Your LUT expires on 2026-10-26. File a new LUT for the next financial year.",
        },
      ],
    },
    {
      name: "ended yesterday",
      changes: { lutValidTo: "2026-10-25" },
      expected: [
        {
          code: "lut_expired",
          severity: "high",
          message:
            "Your LUT expired on 2026-10-25. File a new LUT (FORM GST RFD-11) before your next export invoice.",
        },
      ],
    },
    {
      name: "unregistered with no LUT",
      changes: { gstRegistered: false, lutNumber: null, lutValidFrom: null, lutValidTo: null },
      expected: [],
    },
  ])("$name", ({ changes, expected }) => {
    const rule = rules.find(({ id }) => id === "LUT_REQUIRED");
    expect(checkLut({ ...profile, ...changes }, today, rules)).toEqual(
      expected.map((entry) => ({
        ...entry,
        citation: {
          ruleId: "LUT_REQUIRED",
          source: rule?.source,
          effectiveFrom: rule?.effective_from,
        },
        note: "Verify with your CA.",
      })),
    );
  });
});

describe("GST threshold", () => {
  it.each<{
    gstRegistered: boolean;
    expectedTurnoverInr: number | null;
    expected: Pick<HealthFlag, "code" | "severity" | "message">[];
  }>([
    {
      gstRegistered: false,
      expectedTurnoverInr: null,
      expected: [
        {
          code: "turnover_missing",
          severity: "low",
          message:
            "Add your expected turnover for this financial year so we can check the ₹20 lakh GST registration threshold.",
        },
      ],
    },
    { gstRegistered: false, expectedTurnoverInr: 0, expected: [] },
    { gstRegistered: false, expectedTurnoverInr: 1_599_999, expected: [] },
    {
      gstRegistered: false,
      expectedTurnoverInr: 1_600_000,
      expected: [
        {
          code: "gst_threshold_near",
          severity: "medium",
          message:
            "Expected turnover of ₹16,00,000 is close to the ₹20 lakh GST registration threshold (₹10 lakh in some special-category States).",
        },
      ],
    },
    {
      gstRegistered: false,
      expectedTurnoverInr: 2_000_000,
      expected: [
        {
          code: "gst_threshold_near",
          severity: "medium",
          message:
            "Expected turnover of ₹20,00,000 is close to the ₹20 lakh GST registration threshold (₹10 lakh in some special-category States).",
        },
      ],
    },
    {
      gstRegistered: false,
      expectedTurnoverInr: 2_000_001,
      expected: [
        {
          code: "gst_threshold_exceeded",
          severity: "high",
          message:
            "Expected turnover of ₹20,00,001 is above ₹20 lakh, so GST registration is required (₹10 lakh in some special-category States).",
        },
      ],
    },
    { gstRegistered: true, expectedTurnoverInr: 5_000_000, expected: [] },
    { gstRegistered: true, expectedTurnoverInr: null, expected: [] },
  ])("registered=$gstRegistered, turnover=$expectedTurnoverInr", ({ expected, ...input }) => {
    const rule = rules.find(({ id }) => id === "GST_THRESHOLD");
    expect(checkGstThreshold(input, rules)).toEqual(
      expected.map((entry) => ({
        ...entry,
        citation: {
          ruleId: "GST_THRESHOLD",
          source: rule?.source,
          effectiveFrom: rule?.effective_from,
        },
        note: "Verify with your CA.",
      })),
    );
  });
});

describe("health report", () => {
  it.each<{
    name: string;
    changes: Partial<ProfileInput>;
    score: number;
    codes: HealthFlag["code"][];
    suggestion: string | null;
  }>([
    { name: "base profile", changes: {}, score: 100, codes: [], suggestion: "P0802" },
    {
      name: "demo profile",
      changes: { lutValidFrom: "2025-04-01", lutValidTo: "2026-03-31", purposeCode: "P1006" },
      score: 55,
      codes: ["lut_expired", "purpose_code_mismatch"],
      suggestion: "P0802",
    },
    {
      name: "missing GSTIN",
      changes: { gstin: null },
      score: 85,
      codes: ["gstin_missing"],
      suggestion: "P0802",
    },
    {
      name: "missing work description",
      changes: { workType: null },
      score: 95,
      codes: ["work_type_missing"],
      suggestion: null,
    },
    {
      name: "registered flag order",
      changes: { lutNumber: null, gstin: null, purposeCode: null, workType: null },
      score: 35,
      codes: ["lut_missing", "gstin_missing", "purpose_code_missing", "work_type_missing"],
      suggestion: null,
    },
    {
      name: "unregistered flag order without LUT or GSTIN flags",
      changes: {
        gstRegistered: false,
        gstin: null,
        lutNumber: null,
        lutValidFrom: null,
        lutValidTo: null,
        purposeCode: "P1006",
      },
      score: 70,
      codes: ["gst_threshold_near", "purpose_code_mismatch"],
      suggestion: "P0802",
    },
  ])("$name", ({ changes, score, codes, suggestion }) => {
    const report = evaluateHealth({ ...profile, ...changes }, { today, rules });
    expect(report.score).toBe(score);
    expect(report.flags.map(({ code }) => code)).toEqual(codes);
    if (suggestion === null) expect(report.suggestion).toBeNull();
    else expect(report.suggestion?.code).toBe(suggestion);
    expect(report.checkedOn).toBe(today);
    expect(healthReportSchema.parse(report)).toEqual(report);
    for (const flag of report.flags) {
      const rule = rules.find(({ id }) => id === flag.citation.ruleId);
      expect(flag.citation.source.length).toBeGreaterThan(0);
      expect(flag.citation).toEqual({
        ruleId: rule?.id,
        source: rule?.source,
        effectiveFrom: rule?.effective_from,
      });
      expect(flag.note).toBe("Verify with your CA.");
      if (flag.code === "gstin_missing") {
        expect(flag).toMatchObject({
          severity: "medium",
          message: "GSTIN missing. Export invoices must show your GSTIN.",
          citation: { ruleId: "EXPORT_INVOICE_FIELDS" },
        });
      }
    }
  });
});
