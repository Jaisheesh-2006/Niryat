import { describe, expect, it } from "vitest";
import { fromMinor, toMinor } from "./money";

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
