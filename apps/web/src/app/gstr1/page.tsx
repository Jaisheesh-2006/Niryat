import { gstr1PreviewSchema } from "@niryat/shared";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Gstr1Download } from "../../components/Gstr1Download";
import { apiUrl } from "../../lib/env";

const messages: Record<string, string> = {
  not_gst_registered:
    "GSTR-1 data is only for GST-registered users. If you have registered, update your profile.",
  gstr1_frequency_missing:
    "Choose how you file GSTR-1 (monthly or quarterly) on your profile first.",
  invalid_period: "Choose a valid reporting period for your filing frequency.",
};

async function previewFor(period?: string) {
  const query = period === undefined ? "" : `?period=${encodeURIComponent(period)}`;
  const response = await fetch(new URL(`/gstr1${query}`, apiUrl), {
    headers: { cookie: (await headers()).get("cookie") ?? "" },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login");
  if (response.status === 404) redirect("/profile");
  const json: unknown = await response.json();
  if (!response.ok) {
    const { error } = z.object({ error: z.string() }).parse(json);
    const message = messages[error];
    if (message) return { ok: false, message } as const;
    throw new Error("GSTR-1 preview unavailable");
  }
  return { ok: true, preview: gstr1PreviewSchema.parse(json) } as const;
}

export default async function Gstr1({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = z.object({ period: z.string().optional() }).safeParse(await searchParams);
  const selected = query.success
    ? await previewFor(query.data.period)
    : { ok: false as const, message: messages.invalid_period };
  if (!selected.ok)
    return (
      <>
        <h1>GSTR-1</h1>
        <p>{selected.message}</p>
        <Link href="/profile">Edit profile</Link>
        <p>
          <Link href="/gstr1">Use the latest closed period</Link>
        </p>
      </>
    );
  const { preview } = selected;
  return (
    <>
      <h1>GSTR-1</h1>
      <form method="get">
        <label htmlFor="period">Reporting period</label>
        <select id="period" name="period" defaultValue={preview.period}>
          {!preview.periods.some((period) => period.period === preview.period) && (
            <option value={preview.period}>{preview.label}</option>
          )}
          {preview.periods.map((period) => (
            <option key={period.period} value={period.period}>
              {period.label}
            </option>
          ))}
        </select>
        <button type="submit">Show period</button>
      </form>
      <h2>{preview.label}</h2>
      <p>
        Due {preview.dueDate}. The government sometimes extends this date; check the GST portal.
      </p>
      <p>
        Rule {preview.citation.ruleId}: {preview.citation.source}. Verify with your CA.
      </p>
      {preview.invoices.length === 0 ? (
        <p>No export invoices are dated in this period.</p>
      ) : (
        <>
          <h2>Invoices</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Date</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">LUT</th>
              </tr>
            </thead>
            <tbody>
              {preview.invoices.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td>{invoice.number}</td>
                  <td>{invoice.date}</td>
                  <td>
                    {invoice.currency} {invoice.amount}
                  </td>
                  <td>{invoice.status}</td>
                  <td>
                    {invoice.lutCovered ? (
                      "Covered"
                    ) : (
                      <>
                        Invoice {invoice.number} is not covered by your LUT on {invoice.date}, so it
                        needs IGST. It is not in this file; ask your CA.
                        <p>
                          Rule {preview.citation.ruleId}: {preview.citation.source}. Verify with
                          your CA.
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Refunds</h2>
      <p>
        Refunds are not in this file. Declare credit notes for them in GSTR-1 Table 9B with your CA.
      </p>
      <ul>
        {preview.refunds.map((refund) => (
          <li key={refund.refundId}>
            {refund.date}: invoice {refund.invoiceNumber}, {refund.currency} {refund.amount}
            {refund.creditNote && (
              <>
                <p>{refund.creditNote.message}</p>
                <p>
                  Rule {refund.creditNote.citation.ruleId}: {refund.creditNote.citation.source}.
                  Verify with your CA.
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
      <h2>Reconciliation</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Currency</th>
            <th scope="col">Invoices</th>
            <th scope="col">Refunds</th>
            <th scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {preview.totals.map((total) => (
            <tr key={total.currency}>
              <th scope="row">{total.currency}</th>
              <td>{total.invoices}</td>
              <td>{total.refunds}</td>
              <td>{total.net}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Gstr1Download key={preview.period} preview={preview} />
    </>
  );
}
