import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cite } from "./cite";
import { parseRules, RULES_FILE_URL } from "./load";
import { REMINDER_STAGES, realisationDeadline } from "./rbi-deadline";

const yaml = readFileSync(RULES_FILE_URL, "utf8");
const rules = parseRules(yaml);
const invoice = { number: "2026-27/0001", date: "2026-10-30", currency: "USD" };

describe("RBI realisation deadline", () => {
  it.each([
    ["2026-10-30", "2027-07-30"],
    ["2026-05-31", "2027-02-28"],
    ["2027-05-31", "2028-02-29"],
    ["0099-05-31", "0100-02-28"],
  ])("adds calendar months and clamps %s to %s", (date, deadline) => {
    const result = realisationDeadline({ invoice: { ...invoice, date }, today: date }, rules);
    expect(result.deadline).toBe(deadline);
    expect(result.citation).toEqual(cite(rules, "RBI_REALISATION"));
    expect(result.citation.ruleId).toBe("RBI_REALISATION");
  });

  it.each([
    ["2027-05-30", 61, null],
    ["2027-05-31", 60, 60],
    ["2027-06-29", 31, 60],
    ["2027-06-30", 30, 30],
    ["2027-07-30", 0, 30],
    ["2027-07-31", -1, null],
  ])("counts whole days inclusively on %s", (today, daysRemaining, stage) => {
    const result = realisationDeadline({ invoice, today }, rules);
    expect(result).toMatchObject({ daysRemaining, stage, overdue: daysRemaining < 0 });
    expect(result.message).toBe(
      daysRemaining < 0
        ? "The RBI deadline to receive payment for invoice 2026-27/0001 was 2027-07-30. Ask your bank (AD bank) whether it can extend the deadline."
        : "Receive the full payment for invoice 2026-27/0001 by 2027-07-30.",
    );
    expect(REMINDER_STAGES).toEqual([60, 30]);
  });

  it("uses the INR period", () => {
    expect(
      realisationDeadline({ invoice: { ...invoice, currency: "INR" }, today: invoice.date }, rules)
        .deadline,
    ).toBe("2027-10-30");
  });

  it("changes the deadline through YAML alone", () => {
    const changed = parseRules(yaml.replace("months: 9", "months: 15"));
    expect(realisationDeadline({ invoice, today: invoice.date }, changed).deadline).toBe(
      "2028-01-30",
    );
  });

  it.each([
    undefined,
    {},
    { months: 9 },
    { months: 0, months_inr: 12 },
    { months: -1, months_inr: 12 },
    { months: 1.5, months_inr: 12 },
    { months: 9, months_inr: 0 },
  ])("rejects missing or invalid params: %j", (params) => {
    const changed = rules.map((rule) =>
      rule.id === "RBI_REALISATION" ? { ...rule, params } : rule,
    );
    expect(() => realisationDeadline({ invoice, today: invoice.date }, changed)).toThrow(
      "RBI_REALISATION params missing",
    );
  });

  it.each([
    ["2025-11-13", false],
    ["2025-11-14", true],
    ["2026-06-04", true],
    ["2026-06-05", false],
  ])("flags the uncertain period for %s", (date, uncertainWindow) => {
    const result = realisationDeadline({ invoice: { ...invoice, date }, today: date }, rules);
    expect(result.uncertainWindow).toBe(uncertainWindow);
    expect(result.message).toBe(
      `Receive the full payment for invoice ${invoice.number} by ${result.deadline}.${
        uncertainWindow
          ? " This invoice is dated between 2025-11-14 and 2026-06-04, so a 15-month period may apply; confirm with your bank."
          : ""
      }`,
    );
  });

  it.each(["invalid", "2026-02-30", "2026-13-01", "2026-2-01", "2026-10-30T00:00:00Z"])(
    "rejects invalid invoice and current dates: %s",
    (date) => {
      for (const input of [
        { invoice: { ...invoice, date }, today: invoice.date },
        { invoice, today: date },
      ]) {
        expect(() => realisationDeadline(input, rules)).toThrow(new RangeError("Invalid date"));
      }
    },
  );
});
