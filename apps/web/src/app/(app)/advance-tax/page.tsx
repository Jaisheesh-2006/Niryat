import { advanceTaxSchema, inrRateSchema, invoiceCurrencies } from "@niryat/shared";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "../../../components/PageHeader";
import { Term } from "../../../components/Term";
import { apiUrl } from "../../../lib/env";
import { formatDate, formatMoney } from "../../../lib/format";

export const metadata = { title: "Advance tax" };

const estimateNote = "Estimate — confirm with your CA.";
const invalidQuery = "Enter a valid tax year, positive INR rates and a whole-rupee tax estimate.";
const querySchema = z
  .partialRecord(z.enum(["taxYear", "estimatedTax", ...invoiceCurrencies]), z.string())
  .refine((query) =>
    invoiceCurrencies.every(
      (currency) => !query[currency] || inrRateSchema.safeParse(query[currency]).success,
    ),
  );

async function estimateFor(query: URLSearchParams) {
  const response = await fetch(new URL(`/advance-tax?${query}`, apiUrl), {
    headers: { cookie: (await headers()).get("cookie") ?? "" },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login");
  if (response.status === 404) redirect("/profile");
  const json: unknown = await response.json();
  if (!response.ok) {
    const { error } = z.object({ error: z.string() }).parse(json);
    if (error === "invalid_query") return { ok: false, message: invalidQuery } as const;
    throw new Error("Advance-tax estimate unavailable");
  }
  return { ok: true, estimate: advanceTaxSchema.parse(json) } as const;
}

export default async function AdvanceTax({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next's development searchParams proxy needs a plain copy for record validation.
  const query = querySchema.safeParse({ ...(await searchParams) });
  const params = new URLSearchParams();
  if (query.success) {
    if (query.data.taxYear) params.set("taxYear", query.data.taxYear);
    if (query.data.estimatedTax) params.set("estimatedTax", query.data.estimatedTax);
    const rates = invoiceCurrencies.flatMap((currency) =>
      query.data[currency] ? [`${currency}:${query.data[currency]}`] : [],
    );
    if (rates.length) params.set("rates", rates.join(","));
  }
  const result = query.success
    ? await estimateFor(params)
    : { ok: false as const, message: invalidQuery };
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Income tax payments" description={<Term term="advance_tax" />} />
        <p>{estimateNote}</p>
        <p>{result.message}</p>
        <Link href="/advance-tax">Reset estimate</Link>
      </>
    );
  }
  const { estimate } = result;
  return (
    <>
      <PageHeader title="Income tax payments" description={<Term term="advance_tax" />} />
      <p>{estimateNote}</p>
      <form className="card" method="get">
        <label htmlFor="taxYear">Tax year</label>
        <input id="taxYear" name="taxYear" defaultValue={estimate.taxYear} required />
        {estimate.receipts.map(({ currency }) => (
          <div key={currency}>
            <label htmlFor={`rate-${currency}`}>INR rate for {currency}</label>
            <input
              id={`rate-${currency}`}
              name={currency}
              inputMode="decimal"
              defaultValue={query.success ? (query.data[currency] ?? "") : ""}
            />
          </div>
        ))}
        <label htmlFor="estimatedTax">Estimated tax for the year (whole INR)</label>
        <input
          id="estimatedTax"
          name="estimatedTax"
          type="number"
          min="0"
          max="100000000000"
          step="1"
          defaultValue={estimate.estimatedTaxInr ?? ""}
        />
        <button type="submit">Show estimate</button>
      </form>
      <h2>PayPal receipts for {estimate.taxYear}</h2>
      <div className="card table-wrap">
        <table>
          <caption>{estimateNote}</caption>
          <thead>
            <tr>
              <th scope="col">Currency</th>
              <th scope="col">Payments</th>
              <th scope="col">Refunds</th>
              <th scope="col">Net receipts</th>
            </tr>
          </thead>
          <tbody>
            {estimate.receipts.map((receipt) => (
              <tr key={receipt.currency}>
                <th scope="row">{receipt.currency}</th>
                <td className="num">{formatMoney(receipt.payments, receipt.currency)}</td>
                <td className="num">{formatMoney(receipt.refunds, receipt.currency)}</td>
                <td className="num">{formatMoney(receipt.net, receipt.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card">
        <h2>Simpler income calculation</h2>
        <p>
          <Term term="presumptive" />
        </p>
        <p>{estimate.eligibility.message}</p>
        <p>
          Rule {estimate.eligibility.citation.ruleId}: {estimate.eligibility.citation.source}.
          Verify with your CA.
        </p>
        <p>
          Gross receipts:{" "}
          {estimate.grossReceiptsInr === null
            ? "Not available"
            : formatMoney(estimate.grossReceiptsInr, "INR")}
          . {estimateNote}
        </p>
        <p>
          Income under this scheme (deemed income):{" "}
          {estimate.deemedIncomeInr === null
            ? "Not available"
            : formatMoney(estimate.deemedIncomeInr, "INR")}
          . {estimateNote}
        </p>
      </section>
      <section className="card">
        <h2>Advance-tax schedule</h2>
        <p>
          Estimated tax:{" "}
          {estimate.estimatedTaxInr === null
            ? "Not available"
            : formatMoney(estimate.estimatedTaxInr, "INR")}
          . {estimateNote}
        </p>
        {estimate.messages.map((message) => (
          <div key={message}>
            <p>{message}</p>
            {estimate.citations
              .filter((citation) => citation.ruleId === "ADVANCE_TAX_DATES")
              .map((citation) => (
                <p key={citation.ruleId}>
                  Rule {citation.ruleId}: {citation.source}. Verify with your CA.
                </p>
              ))}
          </div>
        ))}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Schedule</th>
                <th scope="col" className="num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {estimate.schedule.map((row) => (
                <tr key={row.date}>
                  <td>
                    By {formatDate(row.date)}: {row.cumulativePercent}% of the year&apos;s tax
                  </td>
                  <td className="num">
                    {row.amountInr !== null && (
                      <>
                        {" "}
                        ({formatMoney(row.amountInr, "INR")}) — {estimateNote}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {estimate.citations
          .filter((citation) => citation.ruleId === "ADVANCE_TAX_DATES")
          .map((citation) => (
            <p key={citation.ruleId}>
              Rule {citation.ruleId}: {citation.source}. Verify with your CA.
            </p>
          ))}
      </section>
      <Link href="/profile">Edit profile</Link>
    </>
  );
}
