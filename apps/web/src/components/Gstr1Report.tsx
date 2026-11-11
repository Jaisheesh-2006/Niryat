import { type Gstr1Preview, gstr1PreviewSchema } from "@niryat/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apiUrl } from "../lib/env";
import { formatDate, formatMoney } from "../lib/format";
import { invoiceStatus } from "../lib/status";
import { Gstr1Download } from "./Gstr1Download";

export const gstr1Messages: Record<string, string> = {
  not_gst_registered:
    "GST sales return (GSTR-1) data is only for GST-registered freelancers. If registered, the freelancer needs to update their profile.",
  gstr1_frequency_missing:
    "The filing frequency is missing. The freelancer needs to choose monthly or quarterly filing for their GST sales return (GSTR-1) in Profile.",
  invalid_period: "Choose a valid reporting period for your filing frequency.",
};

// A CA passes `client`; the API decides whether that CA may read it.
export async function gstr1PreviewFor(period?: string, client?: string) {
  const query = new URLSearchParams({
    ...(client === undefined ? {} : { client }),
    ...(period === undefined ? {} : { period }),
  }).toString();
  const response = await fetch(new URL(`/gstr1${query ? `?${query}` : ""}`, apiUrl), {
    headers: { cookie: (await headers()).get("cookie") ?? "" },
    cache: "no-store",
  });
  if (response.status === 401) redirect(client === undefined ? "/login" : "/ca/login");
  if (response.status === 404) {
    if (client === undefined) redirect("/profile");
    return { ok: false, message: "Your client hasn't completed their profile yet." } as const;
  }
  const json: unknown = await response.json();
  if (!response.ok) {
    const { error } = z.object({ error: z.string() }).parse(json);
    const message = gstr1Messages[error];
    if (message) return { ok: false, message } as const;
    throw new Error("GSTR-1 preview unavailable");
  }
  return { ok: true, preview: gstr1PreviewSchema.parse(json) } as const;
}

export function Gstr1Report({ preview, client }: { preview: Gstr1Preview; client?: string }) {
  return (
    <>
      <form className="card" method="get">
        <label htmlFor="period">Reporting period</label>
        <select key={preview.period} id="period" name="period" defaultValue={preview.period}>
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
        Due {formatDate(preview.dueDate)}. The government sometimes extends this date; check the GST
        portal.
      </p>
      <p className="citation">
        Rule {preview.citation.ruleId}: {preview.citation.source}. Verify with your CA.
      </p>
      {preview.invoices.length === 0 ? (
        <p>No export invoices are dated in this period.</p>
      ) : (
        <>
          <h2>Invoices</h2>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">LUT</th>
                </tr>
              </thead>
              <tbody>
                {preview.invoices.map((invoice) => (
                  <tr key={invoice.invoiceId}>
                    <td className="mono">{invoice.number}</td>
                    <td>{formatDate(invoice.date)}</td>
                    <td className="num">{formatMoney(invoice.amount, invoice.currency)}</td>
                    <td>{invoiceStatus[invoice.status].label}</td>
                    <td>
                      {invoice.lutCovered ? (
                        "Covered"
                      ) : (
                        <>
                          Invoice {invoice.number} is not covered by your yearly export form (LUT)
                          on {formatDate(invoice.date)}, so it needs IGST. It is not in this file.
                          Ask your CA how to report this invoice.
                          <p className="citation">
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
          </div>
        </>
      )}
      <h2>Refunds</h2>
      <p>
        Refunds are not in this file. Ask your CA to report invoice adjustments (credit notes) in
        GSTR-1 Table 9B.
      </p>
      <ul>
        {preview.refunds.map((refund) => (
          <li key={refund.refundId}>
            {formatDate(refund.date)}: invoice {refund.invoiceNumber},{" "}
            {formatMoney(refund.amount, refund.currency)}
            {refund.creditNote && (
              <>
                <p>{refund.creditNote.message}</p>
                <p className="citation">
                  Rule {refund.creditNote.citation.ruleId}: {refund.creditNote.citation.source}.
                  Verify with your CA.
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
      <h2>Check the totals</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Currency</th>
              <th scope="col" className="num">
                Invoices
              </th>
              <th scope="col" className="num">
                Refunds
              </th>
              <th scope="col" className="num">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.totals.map((total) => (
              <tr className="totals-row" key={total.currency}>
                <th scope="row">{total.currency}</th>
                <td className="num">{formatMoney(total.invoices, total.currency)}</td>
                <td className="num">{formatMoney(total.refunds, total.currency)}</td>
                <td className="num">{formatMoney(total.net, total.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Gstr1Download key={preview.period} preview={preview} client={client} />
    </>
  );
}
