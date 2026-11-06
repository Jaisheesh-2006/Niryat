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
    [1, "20261026/0001"],
    [12345, "20261026/12345"],
    [9_999_999, "20261026/9999999"],
  ])("formats sequence %s as %s", (seq, number) => {
    const result = invoiceNumberFor("2026-10-26", seq);
    expect(result).toEqual({ fy: "2026-27", number });
    expect(result.number).toMatch(INVOICE_NUMBER_PATTERN);
  });

  it.each([0, -1, 1.5, 1e7, 1e8, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity])(
    "rejects invalid sequence %s",
    (seq) => {
      expect(() => invoiceNumberFor("2026-10-26", seq)).toThrow(
        new RangeError("Invalid invoice sequence"),
      );
    },
  );

  it.each([
    ["2026-11-06", 4, "20261106/0004", "2026-27"],
    ["2026-11-07", 5, "20261107/0005", "2026-27"],
    ["2027-04-01", 1, "20270401/0001", "2027-28"],
    ["2028-02-29", 10, "20280229/0010", "2027-28"],
  ])("uses the supplied invoice date %s and sequence %s", (date, seq, number, fy) => {
    expect(invoiceNumberFor(date, seq)).toEqual({ fy, number });
  });

  it.each(["2026-02-29", "2026-13-01", "20261106", "2026-11-06T00:00:00Z", ""])(
    "rejects invalid invoice date %s",
    (date) => {
      expect(() => invoiceNumberFor(date, 1)).toThrow(new RangeError("Invalid invoice date"));
    },
  );
});
