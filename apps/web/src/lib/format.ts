import { invoiceCurrencies } from "@niryat/shared";

const dateOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
} satisfies Intl.DateTimeFormatOptions;
const dateFormatter = new Intl.DateTimeFormat("en-IN", dateOptions);
const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  ...dateOptions,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const moneyFormatters = Object.fromEntries(
  [...invoiceCurrencies, "INR"].map((currency): [string, Intl.NumberFormat] => [
    currency,
    new Intl.NumberFormat("en-IN", { style: "currency", currency }),
  ]),
);

export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function formatMonth(value: string): string {
  return monthFormatter.format(new Date(value));
}

export function formatDateTime(value: string): string {
  return `${dateTimeFormatter.format(new Date(value))} IST`;
}

export function formatRelativeTime(value: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 60_000));
  const formatter = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });
  return minutes < 60
    ? formatter.format(-minutes, "minute")
    : formatter.format(-Math.floor(minutes / 60), "hour");
}

function isAmount(value: string): value is Intl.StringNumericLiteral {
  return /^-?\d{1,15}(\.\d{1,4})?$/.test(value);
}

export function formatMoney(amount: string, currency: string): string {
  if (!isAmount(amount)) throw new RangeError("Invalid amount");
  const formatter =
    moneyFormatters[currency] ?? new Intl.NumberFormat("en-IN", { style: "currency", currency });
  return formatter.format(amount);
}
