export const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9/-]{1,16}$/;

export function financialYear(date: string): string {
  const year = Number(date.slice(0, 4)) - (date.slice(5, 7) < "04" ? 1 : 0);
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export function invoiceNumberFor(date: string, seq: number): { fy: string; number: string } {
  const fy = financialYear(date);
  const number = `${fy}/${String(seq).padStart(4, "0")}`;
  if (!Number.isSafeInteger(seq) || seq <= 0 || !INVOICE_NUMBER_PATTERN.test(number)) {
    throw new RangeError("Invalid invoice sequence");
  }
  return { fy, number };
}
