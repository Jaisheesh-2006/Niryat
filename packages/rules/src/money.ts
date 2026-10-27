export function toMinor(value: string): bigint {
  if (/^\d{1,12}(\.\d{1,2})?$/.exec(value)?.[0] !== value) {
    throw new RangeError("Invalid amount");
  }
  const [whole = "", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function fromMinor(minor: bigint): string {
  if (minor < 0n) throw new RangeError("Invalid amount");
  return `${minor / 100n}.${String(minor % 100n).padStart(2, "0")}`;
}
