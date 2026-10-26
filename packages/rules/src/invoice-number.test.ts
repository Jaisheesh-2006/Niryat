import { describe, expect, it } from "vitest";
import { financialYear, INVOICE_NUMBER_PATTERN, invoiceNumberFor } from "./invoice-number";

describe("invoice numbering", () => {
  it.each([
    ["2026-03-31", "2025-26"],
    ["2026-04-01", "2026-27"],
    ["2026-10-26", "2026-27"],
    ["2027-03-31", "2026-27"],
    ["2027-04-01", "2027-28"],
    ["2099-04-01", "2099-00"],
  ])("financial year for %s is %s", (date, expected) => {
    expect(financialYear(date)).toBe(expected);
  });

  it.each([
    [1, "2026-27/0001"],
    [12345, "2026-27/12345"],
    [99_999_999, "2026-27/99999999"],
  ])("formats sequence %s as %s", (seq, number) => {
    const result = invoiceNumberFor("2026-10-26", seq);
    expect(result).toEqual({ fy: "2026-27", number });
    expect(result.number).toMatch(INVOICE_NUMBER_PATTERN);
  });

  it.each([0, -1, 1.5, 1e8, 1e9, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity])(
    "rejects invalid sequence %s",
    (seq) => {
      expect(() => invoiceNumberFor("2026-10-26", seq)).toThrow(
        new RangeError("Invalid invoice sequence"),
      );
    },
  );
});
