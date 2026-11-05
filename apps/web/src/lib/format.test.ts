import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { formatDate, formatDateTime, formatMoney, formatMonth, formatRelativeTime } from "./format";

beforeEach(() => vi.stubEnv("TZ", "UTC"));
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["2026-11-05T12:00:01Z", "this minute"],
  ["2026-11-05T11:59:01Z", "this minute"],
  ["2026-11-05T11:59:00Z", "1 minute ago"],
  ["2026-11-05T11:01:00Z", "59 minutes ago"],
  ["2026-11-05T11:00:00Z", "1 hour ago"],
])("formats sync freshness for %s", (value, expected) => {
  expect(formatRelativeTime(value, new Date("2026-11-05T12:00:00Z"))).toBe(expected);
});

it("formats a date-only value", () => {
  expect(formatDate("2026-08-12")).toBe("12 Aug 2026");
});

it.each([
  ["2026-10-29T18:29:59Z", "29 Oct 2026"],
  ["2026-10-29T18:30:00Z", "30 Oct 2026"],
  ["2026-12-31T18:30:00Z", "1 Jan 2027"],
])("formats %s on its IST date", (value, expected) => {
  expect(formatDate(value)).toBe(expected);
});

it.each(["2026-10", "2026-10-01"])("formats month %s", (value) => {
  expect(formatMonth(value)).toBe("October 2026");
});

it("formats date-time in 24-hour IST", () => {
  expect(formatDateTime("2026-08-12T08:35:00Z")).toBe("12 Aug 2026, 14:05 IST");
  expect(formatDateTime("2026-10-29T18:30:00Z")).toBe("30 Oct 2026, 00:00 IST");
});

it.each([
  ["1234.5", "USD", "$1,234.50"],
  ["1234.5", "CAD", "CA$1,234.50"],
  ["1234.5", "AUD", "A$1,234.50"],
  ["1234.5", "EUR", "€1,234.50"],
  ["1234.5", "GBP", "£1,234.50"],
  ["123456", "INR", "₹1,23,456.00"],
  ["123456789012.125", "INR", "₹1,23,45,67,89,012.13"],
  ["999999999999999.995", "USD", "$1,00,00,00,00,00,00,000.00"],
  ["0.5", "USD", "$0.50"],
  ["-12.3456", "USD", "-$12.35"],
])("formats %s %s without converting to a float", (amount, currency, expected) => {
  expect(formatMoney(amount, currency)).toBe(expected);
});

it.each(["abc", "", "NaN", "Infinity", "1e3", " 1", "1.12345", "1234567890123456"])(
  "rejects invalid amount %j",
  (amount) => {
    expect(() => formatMoney(amount, "USD")).toThrow(new RangeError("Invalid amount"));
  },
);

it.each([formatDate, formatMonth, formatDateTime])("rejects invalid dates in %s", (format) => {
  expect(() => format("not-a-date")).toThrow(RangeError);
  expect(() => format("")).toThrow(RangeError);
});
