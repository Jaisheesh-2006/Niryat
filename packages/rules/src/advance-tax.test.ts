import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advanceTaxDates,
  advanceTaxSchedule,
  presumptiveEligibility,
  taxYearBounds,
} from "./advance-tax";
import { cite } from "./cite";
import { parseRules, RULES_FILE_URL } from "./load";

const yaml = readFileSync(RULES_FILE_URL, "utf8");
const rules = parseRules(yaml);
const taxYear = "2026-27";
const eligibilityInput = { taxYear, specifiedProfession: true, grossReceiptsInr: "1234567.89" };
const scheduleInput = { taxYear, presumptive: false, estimatedTaxInr: "100000" };

describe("tax years and advance-tax dates", () => {
  it.each([
    ["2026-27", "2026-04-01", "2027-03-31"],
    ["2027-28", "2027-04-01", "2028-03-31"],
    ["2099-00", "2099-04-01", "2100-03-31"],
    ["0099-00", "0099-04-01", "0100-03-31"],
    ["9998-99", "9998-04-01", "9999-03-31"],
  ])("returns bounds for %s", (year, start, end) => {
    expect(taxYearBounds(year)).toEqual({ start, end });
    expect(advanceTaxDates(year, rules).at(-1)?.date).toBe(`${end.slice(0, 4)}-03-15`);
  });

  it.each(["", "2026", "2026-28", "2026-7", "2026-2027", "2026-27\n", " 2026-27", "9999-00"])(
    "rejects invalid tax year %j in every function",
    (year) => {
      const calls = [
        () => taxYearBounds(year),
        () => advanceTaxDates(year, rules),
        () => presumptiveEligibility({ ...eligibilityInput, taxYear: year }, rules),
        () => advanceTaxSchedule({ ...scheduleInput, taxYear: year }, rules),
      ];
      for (const call of calls) expect(call).toThrow(new RangeError("Invalid tax year"));
    },
  );

  it("returns the four cumulative dates", () => {
    expect(advanceTaxDates(taxYear, rules)).toEqual([
      { date: "2026-06-15", cumulativePercent: 15 },
      { date: "2026-09-15", cumulativePercent: 45 },
      { date: "2026-12-15", cumulativePercent: 75 },
      { date: "2027-03-15", cumulativePercent: 100 },
    ]);
  });
});

describe("presumptive eligibility", () => {
  it.each([
    {
      specifiedProfession: null,
      grossReceiptsInr: null,
      state: "uncertain",
      reason: "profession_unknown",
      message:
        "Answer the specified-profession question on your profile to check presumptive taxation.",
    },
    {
      specifiedProfession: null,
      grossReceiptsInr: "7500000.01",
      state: "uncertain",
      reason: "profession_unknown",
      message:
        "Answer the specified-profession question on your profile to check presumptive taxation.",
    },
    {
      specifiedProfession: false,
      grossReceiptsInr: null,
      state: "not_eligible",
      reason: "not_specified_profession",
      message:
        "Presumptive taxation does not apply because you said your work is not a specified profession.",
    },
    {
      specifiedProfession: false,
      grossReceiptsInr: "7500000.01",
      state: "not_eligible",
      reason: "not_specified_profession",
      message:
        "Presumptive taxation does not apply because you said your work is not a specified profession.",
    },
    {
      specifiedProfession: true,
      grossReceiptsInr: null,
      state: "uncertain",
      reason: "rate_missing",
      message: "Enter an INR rate for every currency you were paid in to check the receipt limit.",
    },
    {
      specifiedProfession: true,
      grossReceiptsInr: "5000000.01",
      state: "uncertain",
      reason: "cash_share_unknown",
      message:
        "Your PayPal receipts are between 5000000 and 7500000. Presumptive taxation applies only if cash receipts are at most 5% of all receipts, and Niryat sees only PayPal.",
    },
    {
      specifiedProfession: true,
      grossReceiptsInr: "7500000.00",
      state: "uncertain",
      reason: "cash_share_unknown",
      message:
        "Your PayPal receipts are between 5000000 and 7500000. Presumptive taxation applies only if cash receipts are at most 5% of all receipts, and Niryat sees only PayPal.",
    },
    {
      specifiedProfession: true,
      grossReceiptsInr: "7500000.01",
      state: "not_eligible",
      reason: "over_limit",
      message:
        "Your PayPal receipts for tax year 2026-27 are above 7500000, so presumptive taxation does not apply.",
    },
  ])(
    "$specifiedProfession / $grossReceiptsInr => $reason",
    ({ specifiedProfession, grossReceiptsInr, ...expected }) => {
      expect(
        presumptiveEligibility({ taxYear, specifiedProfession, grossReceiptsInr }, rules),
      ).toEqual({
        ...expected,
        deemedIncomeInr: null,
        citation: cite(rules, "PRESUMPTIVE_TAX"),
      });
    },
  );

  it.each([
    ["0", "0.00"],
    ["0.01", "0.01"],
    ["1234567.89", "617283.95"],
    ["5000000.00", "2500000.00"],
  ])("is eligible at %s and rounds deemed income half-up", (grossReceiptsInr, deemedIncomeInr) => {
    expect(presumptiveEligibility({ ...eligibilityInput, grossReceiptsInr }, rules)).toEqual({
      state: "eligible",
      reason: null,
      deemedIncomeInr,
      message:
        "Presumptive taxation may apply: your PayPal receipts for tax year 2026-27 are within 5000000 and you said your work is a specified profession. Deemed income is 50% of gross receipts. This assumes you are a resident individual.",
      citation: cite(rules, "PRESUMPTIVE_TAX"),
    });
  });

  it("reads the receipt limit, percentage and messages from YAML", () => {
    const changed = parseRules(yaml.replace("limit_inr: 5000000", "limit_inr: 6000000"));
    const input = { ...eligibilityInput, grossReceiptsInr: "5500000" };
    expect(presumptiveEligibility(input, rules).reason).toBe("cash_share_unknown");
    expect(presumptiveEligibility(input, changed)).toMatchObject({
      state: "eligible",
      deemedIncomeInr: "2750000.00",
      message: expect.stringContaining("within 6000000"),
    });
    const changedPercent = parseRules(yaml.replace("deemed_percent: 50", "deemed_percent: 60"));
    expect(presumptiveEligibility(eligibilityInput, changedPercent)).toMatchObject({
      deemedIncomeInr: "740740.73",
      message: expect.stringContaining("60% of gross receipts"),
    });
    const changedCash = parseRules(yaml.replace("cash_percent_max: 5", "cash_percent_max: 4"));
    expect(presumptiveEligibility(input, changedCash).message).toContain("at most 4%");
    const changedUpper = parseRules(
      yaml.replace("limit_low_cash_inr: 7500000", "limit_low_cash_inr: 8000000"),
    );
    expect(
      presumptiveEligibility({ ...input, grossReceiptsInr: "7500000.01" }, changedUpper),
    ).toMatchObject({
      reason: "cash_share_unknown",
      message: expect.stringContaining("and 8000000"),
    });
  });
});

describe("advance-tax schedules", () => {
  it("returns regular cumulative amounts with a citation", () => {
    expect(advanceTaxSchedule(scheduleInput, rules)).toEqual({
      notPayable: false,
      message: null,
      citation: cite(rules, "ADVANCE_TAX_DATES"),
      schedule: [
        { date: "2026-06-15", cumulativePercent: 15, amountInr: "15000.00" },
        { date: "2026-09-15", cumulativePercent: 45, amountInr: "45000.00" },
        { date: "2026-12-15", cumulativePercent: 75, amountInr: "75000.00" },
        { date: "2027-03-15", cumulativePercent: 100, amountInr: "100000.00" },
      ],
    });
  });

  it("returns just the March instalment for presumptive filers", () => {
    expect(advanceTaxSchedule({ ...scheduleInput, presumptive: true }, rules).schedule).toEqual([
      { date: "2027-03-15", cumulativePercent: 100, amountInr: "100000.00" },
    ]);
  });

  it.each([false, true])("keeps dates with no estimate (presumptive=%s)", (presumptive) => {
    const result = advanceTaxSchedule(
      { ...scheduleInput, presumptive, estimatedTaxInr: null },
      rules,
    );
    expect(result).toMatchObject({
      notPayable: false,
      message:
        "Enter your estimated tax for the year to see instalment amounts. Niryat does not calculate income tax.",
    });
    expect(result.schedule).toHaveLength(presumptive ? 1 : 4);
    expect(result.schedule.every((row) => row.amountInr === null)).toBe(true);
  });

  it.each(["0", "9999", "9999.99"])(
    "does not require advance tax below the threshold: %s",
    (estimatedTaxInr) => {
      const result = advanceTaxSchedule({ ...scheduleInput, estimatedTaxInr }, rules);
      expect(result).toMatchObject({
        notPayable: true,
        message: "Advance tax is not payable when the tax for the year is under 10000.",
      });
      expect(result.schedule).toHaveLength(4);
      expect(result.schedule.every((row) => row.amountInr === null)).toBe(true);
    },
  );

  it("includes the exact threshold and rounds instalments half-up", () => {
    const exact = advanceTaxSchedule({ ...scheduleInput, estimatedTaxInr: "10000" }, rules);
    expect(exact.notPayable).toBe(false);
    expect(exact.schedule.map((row) => row.amountInr)).toEqual([
      "1500.00",
      "4500.00",
      "7500.00",
      "10000.00",
    ]);
    const rounded = advanceTaxSchedule({ ...scheduleInput, estimatedTaxInr: "10000.10" }, rules);
    expect(rounded.schedule.map((row) => row.amountInr)).toEqual([
      "1500.02",
      "4500.05",
      "7500.08",
      "10000.10",
    ]);
  });

  it("reads the percentages and threshold from YAML", () => {
    const changed = parseRules(
      yaml
        .replace("jun_15_percent: 15", "jun_15_percent: 20")
        .replace("sep_15_percent: 45", "sep_15_percent: 50")
        .replace("dec_15_percent: 75", "dec_15_percent: 80")
        .replace("threshold_inr: 10000", "threshold_inr: 20000"),
    );
    expect(advanceTaxDates(taxYear, changed).map((row) => row.cumulativePercent)).toEqual([
      20, 50, 80, 100,
    ]);
    expect(advanceTaxSchedule(scheduleInput, changed).schedule.map((row) => row.amountInr)).toEqual(
      ["20000.00", "50000.00", "80000.00", "100000.00"],
    );
    expect(
      advanceTaxSchedule({ ...scheduleInput, estimatedTaxInr: "15000" }, changed),
    ).toMatchObject({
      notPayable: true,
      message: "Advance tax is not payable when the tax for the year is under 20000.",
    });
  });
});

describe("rule validation", () => {
  it.each(["", "-1", "1e3", "10000\n", "1.234", "1000000000000"])(
    "rejects malformed amounts %j",
    (amount) => {
      expect(() =>
        presumptiveEligibility({ ...eligibilityInput, grossReceiptsInr: amount }, rules),
      ).toThrow(new RangeError("Invalid amount"));
      expect(() =>
        advanceTaxSchedule({ ...scheduleInput, estimatedTaxInr: amount }, rules),
      ).toThrow(new RangeError("Invalid amount"));
    },
  );

  it.each(["PRESUMPTIVE_TAX", "ADVANCE_TAX_DATES"])(
    "rejects missing or invalid params for %s",
    (id) => {
      const original = rules.find((rule) => rule.id === id)?.params;
      const invalidParams = [
        undefined,
        {},
        ...Object.keys(original ?? {}).flatMap((key) => [
          { ...original, [key]: 0 },
          { ...original, [key]: -1 },
          { ...original, [key]: 1.5 },
        ]),
        id === "PRESUMPTIVE_TAX"
          ? { ...original, deemed_percent: 101 }
          : { ...original, jun_15_percent: 101 },
        id === "PRESUMPTIVE_TAX"
          ? { ...original, limit_inr: 8000000 }
          : { ...original, sep_15_percent: 10 },
      ];
      const variants = [
        rules.filter((rule) => rule.id !== id),
        ...invalidParams.map((params) =>
          rules.map((rule) => (rule.id === id ? { ...rule, params } : rule)),
        ),
      ];
      for (const changed of variants) {
        const calls =
          id === "PRESUMPTIVE_TAX"
            ? [() => presumptiveEligibility(eligibilityInput, changed)]
            : [
                () => advanceTaxDates(taxYear, changed),
                () => advanceTaxSchedule(scheduleInput, changed),
              ];
        for (const call of calls) expect(call).toThrow(`${id} params missing`);
      }
    },
  );

  it("preserves the recorded source and effective date in both citations", () => {
    for (const result of [
      presumptiveEligibility(eligibilityInput, rules),
      advanceTaxSchedule(scheduleInput, rules),
    ]) {
      expect(result.citation.effectiveFrom).toBe("2026-04-01");
      expect(result.citation.source).toBe(
        rules.find((rule) => rule.id === result.citation.ruleId)?.source,
      );
    }
  });
});
