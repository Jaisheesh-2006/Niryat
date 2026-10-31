import type { RuleCitation } from "@niryat/shared";
import { z } from "zod";
import { cite } from "./cite";
import type { RuleMetadata } from "./index";
import { financialYear } from "./invoice-number";
import { fromMinor, toMinor } from "./money";

export function taxYearBounds(taxYear: string): { start: string; end: string } {
  if (/^\d{4}-\d{2}$/.exec(taxYear)?.[0] !== taxYear) {
    throw new RangeError("Invalid tax year");
  }
  const start = `${taxYear.slice(0, 4)}-04-01`;
  const end = `${String(Number(taxYear.slice(0, 4)) + 1).padStart(4, "0")}-03-31`;
  if (
    !z.iso.date().safeParse(start).success ||
    !z.iso.date().safeParse(end).success ||
    financialYear(start).padStart(7, "0") !== taxYear
  ) {
    throw new RangeError("Invalid tax year");
  }
  return { start, end };
}

export function advanceTaxDates(
  taxYear: string,
  rules: readonly RuleMetadata[],
): { date: string; cumulativePercent: number }[] {
  const { start, end } = taxYearBounds(taxYear);
  const percent = z.number().int().positive().max(100);
  const params = z
    .object({
      jun_15_percent: percent,
      sep_15_percent: percent,
      dec_15_percent: percent,
      mar_15_percent: percent,
      threshold_inr: z.number().int().positive().safe(),
    })
    .refine(
      (p) =>
        p.jun_15_percent <= p.sep_15_percent &&
        p.sep_15_percent <= p.dec_15_percent &&
        p.dec_15_percent <= p.mar_15_percent,
    )
    .safeParse(rules.find((rule) => rule.id === "ADVANCE_TAX_DATES")?.params);
  if (!params.success) throw new Error("ADVANCE_TAX_DATES params missing");
  return [
    { date: `${start.slice(0, 4)}-06-15`, cumulativePercent: params.data.jun_15_percent },
    { date: `${start.slice(0, 4)}-09-15`, cumulativePercent: params.data.sep_15_percent },
    { date: `${start.slice(0, 4)}-12-15`, cumulativePercent: params.data.dec_15_percent },
    { date: `${end.slice(0, 4)}-03-15`, cumulativePercent: params.data.mar_15_percent },
  ];
}

export function presumptiveEligibility(
  input: {
    taxYear: string;
    specifiedProfession: boolean | null;
    grossReceiptsInr: string | null;
  },
  rules: readonly RuleMetadata[],
): {
  state: "eligible" | "not_eligible" | "uncertain";
  reason: string | null;
  message: string;
  deemedIncomeInr: string | null;
  citation: RuleCitation;
} {
  taxYearBounds(input.taxYear);
  const params = z
    .object({
      deemed_percent: z.number().int().positive().max(100),
      limit_inr: z.number().int().positive().safe(),
      limit_low_cash_inr: z.number().int().positive().safe(),
      cash_percent_max: z.number().int().positive().max(100),
    })
    .refine((p) => p.limit_inr <= p.limit_low_cash_inr)
    .safeParse(rules.find((rule) => rule.id === "PRESUMPTIVE_TAX")?.params);
  if (!params.success) throw new Error("PRESUMPTIVE_TAX params missing");
  const p = params.data;
  let state: "eligible" | "not_eligible" | "uncertain";
  let reason: string | null = null;
  let message: string;
  let deemedIncomeInr: string | null = null;
  if (input.specifiedProfession === null) {
    state = "uncertain";
    reason = "profession_unknown";
    message =
      "Answer the specified-profession question on your profile to check presumptive taxation.";
  } else if (!input.specifiedProfession) {
    state = "not_eligible";
    reason = "not_specified_profession";
    message =
      "Presumptive taxation does not apply because you said your work is not a specified profession.";
  } else if (input.grossReceiptsInr === null) {
    state = "uncertain";
    reason = "rate_missing";
    message = "Enter an INR rate for every currency you were paid in to check the receipt limit.";
  } else {
    const receipts = toMinor(input.grossReceiptsInr);
    if (receipts <= BigInt(p.limit_inr) * 100n) {
      state = "eligible";
      deemedIncomeInr = fromMinor((receipts * BigInt(p.deemed_percent) + 50n) / 100n);
      message = `Presumptive taxation may apply: your PayPal receipts for tax year ${input.taxYear} are within ${p.limit_inr} and you said your work is a specified profession. Deemed income is ${p.deemed_percent}% of gross receipts. This assumes you are a resident individual.`;
    } else if (receipts <= BigInt(p.limit_low_cash_inr) * 100n) {
      state = "uncertain";
      reason = "cash_share_unknown";
      message = `Your PayPal receipts are between ${p.limit_inr} and ${p.limit_low_cash_inr}. Presumptive taxation applies only if cash receipts are at most ${p.cash_percent_max}% of all receipts, and Niryat sees only PayPal.`;
    } else {
      state = "not_eligible";
      reason = "over_limit";
      message = `Your PayPal receipts for tax year ${input.taxYear} are above ${p.limit_low_cash_inr}, so presumptive taxation does not apply.`;
    }
  }
  return { state, reason, message, deemedIncomeInr, citation: cite(rules, "PRESUMPTIVE_TAX") };
}

export function advanceTaxSchedule(
  input: {
    taxYear: string;
    presumptive: boolean;
    estimatedTaxInr: string | null;
  },
  rules: readonly RuleMetadata[],
): {
  notPayable: boolean;
  schedule: { date: string; cumulativePercent: number; amountInr: string | null }[];
  message: string | null;
  citation: RuleCitation;
} {
  const dates = advanceTaxDates(input.taxYear, rules);
  const threshold = rules.find((rule) => rule.id === "ADVANCE_TAX_DATES")?.params?.threshold_inr;
  if (threshold === undefined) throw new Error("ADVANCE_TAX_DATES params missing");
  const estimate = input.estimatedTaxInr === null ? null : toMinor(input.estimatedTaxInr);
  const notPayable = estimate !== null && estimate < BigInt(threshold) * 100n;
  const schedule = (input.presumptive ? dates.slice(-1) : dates).map((row) => ({
    ...row,
    amountInr:
      estimate === null || notPayable
        ? null
        : fromMinor((estimate * BigInt(row.cumulativePercent) + 50n) / 100n),
  }));
  const message = notPayable
    ? `Advance tax is not payable when the tax for the year is under ${threshold}.`
    : estimate === null
      ? "Enter your estimated tax for the year to see instalment amounts. Niryat does not calculate income tax."
      : null;
  return { notPayable, schedule, message, citation: cite(rules, "ADVANCE_TAX_DATES") };
}
