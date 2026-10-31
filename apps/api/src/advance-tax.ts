import { getProfile, listInvoices } from "@niryat/db";
import {
  advanceTaxSchedule,
  formatSignedMinor,
  fromMinor,
  inrValue,
  presumptiveEligibility,
  taxYearBounds,
  toMinor,
} from "@niryat/rules";
import { advanceTaxSchema } from "@niryat/shared";
import type { AppDeps } from "./routes/auth";
import { indiaDate, rules } from "./rules";

export async function advanceTaxEstimate(
  deps: Pick<AppDeps, "db" | "encryptionKey">,
  userId: string,
  input: {
    taxYear: string;
    rates: Readonly<Record<string, string>>;
    estimatedTaxInr: string | null;
  },
) {
  const profile = await getProfile(deps.db, userId, deps.encryptionKey);
  if (!profile) return { ok: false, error: "not_found", status: 404 } as const;
  const { start, end } = taxYearBounds(input.taxYear);
  const totals = new Map<string, { payments: bigint; refunds: bigint }>();
  const invoices = await listInvoices(deps.db, userId);
  for (const invoice of invoices) {
    for (const kind of ["payments", "refunds"] as const) {
      for (const receipt of invoice[kind]) {
        const date = indiaDate(receipt.receivedAt);
        if (date < start || date > end) continue;
        const total = totals.get(receipt.currency) ?? { payments: 0n, refunds: 0n };
        total[kind] += toMinor(receipt.gross);
        totals.set(receipt.currency, total);
      }
    }
  }
  let inrTotal = 0n;
  let missingRate = false;
  const receipts = [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => {
      const net = total.payments - total.refunds;
      const rate = input.rates[currency];
      if (rate === undefined) missingRate = true;
      else inrTotal += toMinor(inrValue(fromMinor(net < 0n ? 0n : net), rate));
      return {
        currency,
        payments: fromMinor(total.payments),
        refunds: fromMinor(total.refunds),
        net: formatSignedMinor(net),
      };
    });
  const grossReceiptsInr = missingRate ? null : fromMinor(inrTotal);
  const { deemedIncomeInr, ...eligibility } = presumptiveEligibility(
    { taxYear: input.taxYear, specifiedProfession: profile.specifiedProfession, grossReceiptsInr },
    rules,
  );
  const schedule = advanceTaxSchedule(
    {
      taxYear: input.taxYear,
      presumptive: eligibility.state === "eligible",
      estimatedTaxInr: input.estimatedTaxInr,
    },
    rules,
  );
  return {
    ok: true,
    estimate: advanceTaxSchema.parse({
      taxYear: input.taxYear,
      receipts,
      grossReceiptsInr,
      eligibility,
      deemedIncomeInr,
      estimatedTaxInr: input.estimatedTaxInr,
      notPayable: schedule.notPayable,
      schedule: schedule.schedule,
      messages: schedule.message === null ? [] : [schedule.message],
      citations: [eligibility.citation, schedule.citation],
    }),
  } as const;
}
