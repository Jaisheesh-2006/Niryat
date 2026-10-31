import { z } from "zod";
import { cite } from "./cite";
import type { RuleMetadata } from "./index";
import { INVOICE_NUMBER_PATTERN } from "./invoice-number";
import { fromMinor, inrValue, toMinor } from "./money";

export type Gstr1Frequency = "monthly" | "quarterly";

function parseDate(value: string): Date {
  if (!z.iso.date().safeParse(value).success) throw new RangeError("Invalid period");
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(date: Date): string {
  const value = date.toISOString().slice(0, 10);
  parseDate(value);
  return value;
}

function monthStart(year: number, month: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 1);
  return date;
}

function monthName(date: Date): string {
  return date.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
}

function periodAt(frequency: Gstr1Frequency, date: Date): string {
  const text = dateText(date);
  if (frequency === "monthly") return text.slice(0, 7);
  if (frequency !== "quarterly") throw new RangeError("Invalid period");
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear() - (month < 3 ? 1 : 0);
  return `${String(year).padStart(4, "0")}-${String((year + 1) % 100).padStart(2, "0")}-Q${Math.floor(((month + 9) % 12) / 3) + 1}`;
}

export function gstr1Period(period: string, rules: readonly RuleMetadata[]) {
  const match = /^(\d{4})-(\d{2})(?:-Q([1-4]))?$/.exec(period);
  if (!match || match[0] !== period) throw new RangeError("Invalid period");
  const [, yearText = "", part = "", quarter] = match;
  const year = Number(yearText);
  const frequency: Gstr1Frequency = quarter ? "quarterly" : "monthly";
  if (quarter ? Number(part) !== (year + 1) % 100 : Number(part) < 1 || Number(part) > 12) {
    throw new RangeError("Invalid period");
  }
  const params = z
    .object({
      monthly_due_day: z.number().int().min(1).max(31),
      quarterly_due_day: z.number().int().min(1).max(31),
    })
    .safeParse(rules.find((rule) => rule.id === "GSTR1_6A")?.params);
  if (!params.success) throw new Error("GSTR1_6A params missing");

  const month = quarter ? (Number(quarter) - 1) * 3 + 3 : Number(part) - 1;
  const start = monthStart(year, month);
  const next = monthStart(year, month + (quarter ? 3 : 1));
  const end = new Date(next);
  end.setUTCDate(0);
  const day = quarter ? params.data.quarterly_due_day : params.data.monthly_due_day;
  const dueDate = `${dateText(next).slice(0, 7)}-${String(day).padStart(2, "0")}`;
  parseDate(dueDate);
  return {
    frequency,
    label: quarter
      ? `Q${quarter} ${yearText}-${part} (${monthName(start)} to ${monthName(end)} ${end.getUTCFullYear()})`
      : `${monthName(start)} ${yearText}`,
    start: dateText(start),
    end: dateText(end),
    dueDate,
    citation: cite(rules, "GSTR1_6A"),
  };
}

export function latestClosedPeriod(frequency: Gstr1Frequency, today: string): string {
  const date = parseDate(today);
  const month = date.getUTCMonth();
  const start = monthStart(
    date.getUTCFullYear(),
    frequency === "quarterly" ? Math.floor(month / 3) * 3 : month,
  );
  start.setUTCDate(0);
  return periodAt(frequency, start);
}

export function gstr1PeriodsDueBetween(
  frequency: Gstr1Frequency,
  from: string,
  to: string,
  rules: readonly RuleMetadata[],
): string[] {
  const first = parseDate(from);
  const last = parseDate(to);
  if (from > to || (frequency !== "monthly" && frequency !== "quarterly")) {
    throw new RangeError("Invalid period");
  }
  const periods: string[] = [];
  const cursor = monthStart(first.getUTCFullYear(), first.getUTCMonth());
  while (cursor <= last) {
    if (frequency === "monthly" || cursor.getUTCMonth() % 3 === 0) {
      const previous = new Date(cursor);
      previous.setUTCDate(0);
      const period = periodAt(frequency, previous);
      const { dueDate } = gstr1Period(period, rules);
      if (dueDate >= from && dueDate <= to) periods.push(period);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

export function gstr1RecentPeriods(
  frequency: Gstr1Frequency,
  today: string,
  rules: readonly RuleMetadata[],
): { period: string; label: string }[] {
  let before = today;
  return Array.from({ length: 8 }, () => {
    const period = latestClosedPeriod(frequency, before);
    const { label, start } = gstr1Period(period, rules);
    before = start;
    return { period, label };
  });
}

export function gstr1LutCovers(date: string, lut: { from: string; to: string } | null): boolean {
  parseDate(date);
  if (!lut) return false;
  parseDate(lut.from);
  parseDate(lut.to);
  if (lut.from > lut.to) throw new RangeError("Invalid period");
  return lut.from <= date && date <= lut.to;
}

const invoiceSchema = z.strictObject({
  invoiceId: z.string().min(1),
  number: z.string().refine((value) => INVOICE_NUMBER_PATTERN.exec(value)?.[0] === value),
  date: z.string(),
  amount: z.string(),
  inrRate: z.string().nullable(),
  gstRate: z.string().nullable(),
});

export function gstr1ExportRows(
  input: {
    invoices: readonly z.infer<typeof invoiceSchema>[];
    lut: { from: string; to: string } | null;
  },
  rules: readonly RuleMetadata[],
) {
  const parsed = z.array(invoiceSchema).safeParse(input.invoices);
  if (
    !parsed.success ||
    new Set(parsed.data.map((invoice) => invoice.invoiceId)).size !== parsed.data.length
  ) {
    throw new RangeError("Invalid invoices");
  }
  const lut = input.lut;
  if (lut) {
    parseDate(lut.from);
    parseDate(lut.to);
    if (lut.from > lut.to) throw new RangeError("Invalid period");
  }
  const rows: {
    invoiceId: string;
    number: string;
    date: string;
    exportType: "WOPAY";
    invoiceValueInr: string;
    taxableValueInr: string;
    gstRate: string;
  }[] = [];
  const excluded: {
    invoiceId: string;
    number: string;
    date: string;
    reason: "lut_not_valid";
    message: string;
  }[] = [];
  let total = 0n;
  for (const invoice of parsed.data.sort((a, b) =>
    a.number < b.number ? -1 : a.number > b.number ? 1 : 0,
  )) {
    toMinor(invoice.amount);
    const { invoiceId, number, date } = invoice;
    if (!gstr1LutCovers(date, lut)) {
      excluded.push({
        invoiceId,
        number,
        date,
        reason: "lut_not_valid",
        message: `Invoice ${number} is not covered by your LUT on ${date}, so it needs IGST. It is not in this file; ask your CA.`,
      });
      continue;
    }
    if (invoice.inrRate === null) throw new RangeError("Invalid INR rate");
    if (
      invoice.gstRate === null ||
      /^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/.exec(invoice.gstRate)?.[0] !== invoice.gstRate
    ) {
      throw new RangeError("Invalid GST rate");
    }
    const value = inrValue(invoice.amount, invoice.inrRate);
    rows.push({
      invoiceId,
      number,
      date,
      exportType: "WOPAY",
      invoiceValueInr: value,
      taxableValueInr: value,
      gstRate: fromMinor(toMinor(invoice.gstRate)),
    });
    total += BigInt(value.replace(".", ""));
  }
  return { rows, excluded, totalInr: fromMinor(total), citation: cite(rules, "GSTR1_6A") };
}
