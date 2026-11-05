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
        "No yearly export form (LUT) is saved. Without a valid LUT, export invoices must charge IGST, which you then claim back as a refund. Ask your CA to file form RFD-11, then update your profile.",
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
        `Your yearly export form (LUT) is valid only from ${lutValidFrom}. Exports before then are not covered. Ask your CA how to handle any earlier invoices.`,
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
        `Your yearly export form (LUT) expired on ${lutValidTo}. Ask your CA to file a new form RFD-11 before your next export invoice, then update your profile.`,
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
        `Your yearly export form (LUT) expires on ${lutValidTo}. Ask your CA to file a new form RFD-11 for the next financial year, then update your profile.`,
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
        "Add your expected turnover for this financial year to your profile so we can check the ₹20 lakh GST registration threshold.",
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
        `Expected turnover of ₹${inr} is above ₹20 lakh, so GST registration is required (₹10 lakh in some special-category States). Ask your CA to help you register.`,
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
        `Expected turnover of ₹${inr} is close to the ₹20 lakh GST registration threshold (₹10 lakh in some special-category States). Ask your CA when you need to register.`,
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
        "Your GST identification number (GSTIN) is missing. Add it to your profile; export invoices must show it.",
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
