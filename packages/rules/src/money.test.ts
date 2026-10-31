import { describe, expect, it } from "vitest";
import { formatSignedMinor, fromMinor, inrValue, toMinor } from "./money";

describe("exact money conversion", () => {
  it.each([
    ["0", 0n, "0.00"],
    ["0.1", 10n, "0.10"],
    ["100", 10000n, "100.00"],
    ["1234.5", 123450n, "1234.50"],
    ["0001.01", 101n, "1.01"],
    ["999999999999.99", 99999999999999n, "999999999999.99"],
  ])("converts %s exactly and formats two decimals", (value, minor, formatted) => {
    expect(toMinor(value)).toBe(minor);
    expect(fromMinor(minor)).toBe(formatted);
    expect(toMinor(fromMinor(minor))).toBe(minor);
  });

  it.each([
    "1e3",
    "-1",
    "1.234",
    "1000000000000",
    "",
    ".1",
    "1.",
    "+1",
    " 1",
    "1 ",
    "1\n",
    "NaN",
    "Infinity",
  ])("rejects invalid amount %j without exposing it", (value) => {
    expect(() => toMinor(value)).toThrow(new RangeError("Invalid amount"));
  });

  it("rejects negative minor units", () => {
    expect(() => fromMinor(-1n)).toThrow(new RangeError("Invalid amount"));
  });
});

describe("INR conversion", () => {
  it.each([
    ["100.00", "84.1234", "8412.34"],
    ["0.05", "83.5", "4.18"],
    ["0.01", "0.5", "0.01"],
    ["0.01", "0.4999", "0.00"],
    ["0", "84", "0.00"],
    ["10", "1.0000", "10.00"],
    ["999999999999.99", "9999.9999", "9999999899999900.00"],
  ])("converts %s at %s exactly", (amount, rate, expected) => {
    expect(inrValue(amount, rate)).toBe(expected);
  });

  it.each(["0", "0.0000", "-1", "10000", "1.00001", "1e2", "", ".5", "1.", " 1", "1\n"])(
    "rejects rate %j without exposing it",
    (rate) => expect(() => inrValue("1", rate)).toThrow(new RangeError("Invalid INR rate")),
  );

  it.each(["-1", "1.001", "1e2", "", "1\n"])("rejects amount %j", (amount) => {
    expect(() => inrValue(amount, "84")).toThrow(new RangeError("Invalid amount"));
  });
});

it.each([
  [-1250n, "-12.50"],
  [-1n, "-0.01"],
  [0n, "0.00"],
  [310n, "3.10"],
])("formats signed minor units %s", (minor, expected) => {
  expect(formatSignedMinor(minor)).toBe(expected);
});
