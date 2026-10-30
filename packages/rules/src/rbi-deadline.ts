import type { RuleCitation } from "@niryat/shared";
import { z } from "zod";
import { cite } from "./cite";
import type { RuleMetadata } from "./index";

export const REMINDER_STAGES = [60, 30] as const;

export type RbiDeadline = {
  deadline: string;
  daysRemaining: number;
  stage: (typeof REMINDER_STAGES)[number] | null;
  overdue: boolean;
  uncertainWindow: boolean;
  message: string;
  citation: RuleCitation;
};

function parseDate(value: string): Date {
  if (!z.iso.date().safeParse(value).success) throw new RangeError("Invalid date");
  return new Date(`${value}T00:00:00.000Z`);
}

export function realisationDeadline(
  input: { invoice: { number: string; date: string; currency: string }; today: string },
  rules: readonly RuleMetadata[],
): RbiDeadline {
  const { invoice } = input;
  const params = z
    .object({ months: z.number().int().positive(), months_inr: z.number().int().positive() })
    .safeParse(rules.find((rule) => rule.id === "RBI_REALISATION")?.params);
  if (!params.success) throw new Error("RBI_REALISATION params missing");

  const date = parseDate(invoice.date);
  const today = parseDate(input.today);
  const months = invoice.currency === "INR" ? params.data.months_inr : params.data.months;
  const due = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  due.setUTCFullYear(date.getUTCFullYear());
  due.setUTCMonth(date.getUTCMonth() + months + 1, 0);
  due.setUTCDate(Math.min(date.getUTCDate(), due.getUTCDate()));
  const deadline = due.toISOString().slice(0, 10);
  parseDate(deadline);
  const daysRemaining = (due.getTime() - today.getTime()) / 86_400_000;
  const overdue = daysRemaining < 0;
  const uncertainWindow = invoice.date >= "2025-11-14" && invoice.date <= "2026-06-04";
  const stage =
    daysRemaining < 0 || daysRemaining > REMINDER_STAGES[0]
      ? null
      : daysRemaining <= REMINDER_STAGES[1]
        ? REMINDER_STAGES[1]
        : REMINDER_STAGES[0];
  const message = overdue
    ? `The RBI deadline to receive payment for invoice ${invoice.number} was ${deadline}. Ask your bank (AD bank) whether it can extend the deadline.`
    : `Receive the full payment for invoice ${invoice.number} by ${deadline}.`;

  return {
    deadline,
    daysRemaining,
    stage,
    overdue,
    uncertainWindow,
    message: uncertainWindow
      ? `${message} This invoice is dated between 2025-11-14 and 2026-06-04, so a 15-month period may apply; confirm with your bank.`
      : message,
    citation: cite(rules, "RBI_REALISATION"),
  };
}
