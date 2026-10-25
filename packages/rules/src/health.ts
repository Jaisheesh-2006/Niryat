import type { HealthFlag, HealthReport, ProfileInput } from "@niryat/shared";
import { flag } from "./cite";
import type { RuleMetadata } from "./index";
import { checkPurposeCode, suggestPurposeCode } from "./purpose-codes";

// Product weighting and warning windows, not law.
export const SEVERITY_PENALTY = { high: 30, medium: 15, low: 5 } as const;
export const LUT_RENEWAL_WARNING_DAYS = 30;
export const GST_NEAR_THRESHOLD_INR = 1_600_000;
// GST_THRESHOLD rule: registration required above Rs 20 lakh (CGST Act s. 22(1)).
export const GST_THRESHOLD_INR = 2_000_000;

// Covers LUT validity only; IGST due on exports unpaid after one year is a later spec.
export function checkLut(
  profile: Pick<ProfileInput, "gstRegistered" | "lutNumber" | "lutValidFrom" | "lutValidTo">,
  today: string,
  rules: readonly RuleMetadata[],
): HealthFlag[] {
  const { gstRegistered, lutNumber, lutValidFrom, lutValidTo } = profile;
  if (!gstRegistered) return [];
  if (lutNumber === null || lutValidFrom === null || lutValidTo === null) {
    return [
      flag(
        rules,
        "LUT_REQUIRED",
        "lut_missing",
        "high",
        "No LUT on file. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund.",
      ),
    ];
  }
  if (today < lutValidFrom) {
    return [
      flag(
        rules,
        "LUT_REQUIRED",
        "lut_not_started",
        "high",
        `Your LUT is valid only from ${lutValidFrom}. Exports before then are not covered.`,
      ),
    ];
  }
  if (today > lutValidTo) {
    return [
      flag(
        rules,
        "LUT_REQUIRED",
        "lut_expired",
        "high",
        `Your LUT expired on ${lutValidTo}. File a new LUT (FORM GST RFD-11) before your next export invoice.`,
      ),
    ];
  }
  if ((Date.parse(lutValidTo) - Date.parse(today)) / 86_400_000 <= LUT_RENEWAL_WARNING_DAYS) {
    return [
      flag(
        rules,
        "LUT_REQUIRED",
        "lut_expiring",
        "low",
        `Your LUT expires on ${lutValidTo}. File a new LUT for the next financial year.`,
      ),
    ];
  }
  return [];
}

// shortcut: Rs 20 lakh only; special-category States need the user's State, add if a user needs it.
export function checkGstThreshold(
  profile: Pick<ProfileInput, "gstRegistered" | "expectedTurnoverInr">,
  rules: readonly RuleMetadata[],
): HealthFlag[] {
  const { gstRegistered, expectedTurnoverInr } = profile;
  if (gstRegistered) return [];
  if (expectedTurnoverInr === null) {
    return [
      flag(
        rules,
        "GST_THRESHOLD",
        "turnover_missing",
        "low",
        "Add your expected turnover for this financial year so we can check the ₹20 lakh GST registration threshold.",
      ),
    ];
  }
  const inr = new Intl.NumberFormat("en-IN").format(expectedTurnoverInr);
  if (expectedTurnoverInr > GST_THRESHOLD_INR) {
    return [
      flag(
        rules,
        "GST_THRESHOLD",
        "gst_threshold_exceeded",
        "high",
        `Expected turnover of ₹${inr} is above ₹20 lakh, so GST registration is required (₹10 lakh in some special-category States).`,
      ),
    ];
  }
  if (expectedTurnoverInr >= GST_NEAR_THRESHOLD_INR) {
    return [
      flag(
        rules,
        "GST_THRESHOLD",
        "gst_threshold_near",
        "medium",
        `Expected turnover of ₹${inr} is close to the ₹20 lakh GST registration threshold (₹10 lakh in some special-category States).`,
      ),
    ];
  }
  return [];
}

export function evaluateHealth(
  profile: ProfileInput,
  options: { today: string; rules: readonly RuleMetadata[] },
): HealthReport {
  const { today, rules } = options;
  const flags = checkLut(profile, today, rules);
  if (profile.gstRegistered && profile.gstin === null) {
    flags.push(
      flag(
        rules,
        "EXPORT_INVOICE_FIELDS",
        "gstin_missing",
        "medium",
        "GSTIN missing. Export invoices must show your GSTIN.",
      ),
    );
  }
  flags.push(...checkGstThreshold(profile, rules), ...checkPurposeCode(profile, rules));
  return {
    score: Math.max(0, 100 - flags.reduce((sum, flag) => sum + SEVERITY_PENALTY[flag.severity], 0)),
    flags,
    suggestion: profile.workType === null ? null : suggestPurposeCode(profile.workType),
    checkedOn: today,
  };
}
