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

export function formatSignedMinor(minor: bigint): string {
  return minor < 0n ? `-${fromMinor(-minor)}` : fromMinor(minor);
}

export function inrValue(amount: string, rate: string): string {
  if (/^\d{1,4}(\.\d{1,4})?$/.exec(rate)?.[0] !== rate) {
    throw new RangeError("Invalid INR rate");
  }
  const [whole = "", fraction = ""] = rate.split(".");
  const scaledRate = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
  if (scaledRate === 0n) throw new RangeError("Invalid INR rate");
  return fromMinor((toMinor(amount) * scaledRate + 5000n) / 10000n);
}
