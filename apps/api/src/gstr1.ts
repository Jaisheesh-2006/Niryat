import { getProfile, listInvoices } from "@niryat/db";
import {
  formatSignedMinor,
  fromMinor,
  type gstr1ExportRows,
  gstr1LutCovers,
  gstr1Period,
  gstr1RecentPeriods,
  latestClosedPeriod,
  toMinor,
} from "@niryat/rules";
import { type Gstr1Preview, gstr1PreviewSchema } from "@niryat/shared";
import { toInvoiceView } from "./compliance";
import type { AppDeps } from "./routes/auth";
import { indiaDate, rules } from "./rules";

export async function gstr1Preview(
  deps: Pick<AppDeps, "db" | "encryptionKey">,
  userId: string,
  requestedPeriod: string | undefined,
  today: string,
) {
  const profile = await getProfile(deps.db, userId, deps.encryptionKey);
  if (!profile) return { ok: false, error: "not_found", status: 404 } as const;
  if (!profile.gstRegistered) {
    return { ok: false, error: "not_gst_registered", status: 403 } as const;
  }
  if (!profile.gstr1Frequency) {
    return { ok: false, error: "gstr1_frequency_missing", status: 409 } as const;
  }
  const period = requestedPeriod ?? latestClosedPeriod(profile.gstr1Frequency, today);
  let window: ReturnType<typeof gstr1Period>;
  try {
    window = gstr1Period(period, rules);
  } catch (error) {
    if (error instanceof RangeError && error.message === "Invalid period") {
      return { ok: false, error: "invalid_period", status: 400 } as const;
    }
    throw error;
  }
  if (window.frequency !== profile.gstr1Frequency) {
    return { ok: false, error: "invalid_period", status: 400 } as const;
  }
  const lut =
    profile.lutValidFrom && profile.lutValidTo
      ? { from: profile.lutValidFrom, to: profile.lutValidTo }
      : null;
  const preview: Gstr1Preview = {
    period,
    ...window,
    periods: gstr1RecentPeriods(profile.gstr1Frequency, today, rules),
    invoices: [],
    refunds: [],
    totals: [],
  };
  const totals = new Map<string, { invoices: bigint; refunds: bigint }>();
  function total(currency: string) {
    let entry = totals.get(currency);
    if (!entry) {
      entry = { invoices: 0n, refunds: 0n };
      totals.set(currency, entry);
    }
    return entry;
  }
  const invoices = await listInvoices(deps.db, userId);
  for (const invoice of invoices) {
    if (invoice.date >= window.start && invoice.date <= window.end) {
      preview.invoices.push({
        invoiceId: invoice.id,
        number: invoice.number,
        date: invoice.date,
        currency: invoice.currency,
        amount: invoice.amount,
        status: invoice.status,
        lutCovered: gstr1LutCovers(invoice.date, lut),
      });
      total(invoice.currency).invoices += toMinor(invoice.amount);
    }
    const view = toInvoiceView(invoice, profile.gstRegistered, today);
    for (const refund of invoice.refunds) {
      const date = indiaDate(refund.receivedAt);
      if (date < window.start || date > window.end) continue;
      preview.refunds.push({
        refundId: refund.paypalTxnId,
        invoiceNumber: invoice.number,
        date,
        currency: refund.currency,
        amount: refund.gross,
        creditNote:
          view.compliance.creditNotes.find((note) => note.refundId === refund.paypalTxnId) ?? null,
      });
      total(refund.currency).refunds += toMinor(refund.gross);
    }
  }
  preview.invoices.sort((a, b) => a.number.localeCompare(b.number));
  preview.refunds.sort(
    (a, b) => a.date.localeCompare(b.date) || a.refundId.localeCompare(b.refundId),
  );
  preview.totals = [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => ({
      currency,
      invoices: fromMinor(value.invoices),
      refunds: fromMinor(value.refunds),
      net: formatSignedMinor(value.invoices - value.refunds),
    }));
  return { ok: true, preview: gstr1PreviewSchema.parse(preview), lut } as const;
}

export function gstr1Csv(rows: ReturnType<typeof gstr1ExportRows>["rows"]): string {
  const quote = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const header =
    "Export Type,Invoice Number,Invoice date,Invoice Value,Port Code,Shipping Bill Number,Shipping Bill Date,Rate,Taxable Value,Cess Amount";
  const lines = rows.map((row) => {
    const date = new Date(`${row.date}T00:00:00Z`);
    const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return [
      row.exportType,
      row.number,
      `${row.date.slice(8)}-${month}-${row.date.slice(0, 4)}`,
      row.invoiceValueInr,
      "",
      "",
      "",
      row.gstRate,
      row.taxableValueInr,
      "",
    ]
      .map(quote)
      .join(",");
  });
  return [header, ...lines, ""].join("\r\n");
}
