import { advanceTaxSchema, inrRateSchema, invoiceCurrencies } from "@niryat/shared";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apiUrl } from "../../lib/env";

const estimateNote = "Estimate — confirm with your CA.";
const invalidQuery = "Enter a valid tax year, positive INR rates and a whole-rupee tax estimate.";
const querySchema = z
  .partialRecord(z.enum(["taxYear", "estimatedTax", ...invoiceCurrencies]), z.string())
  .refine((query) =>
    invoiceCurrencies.every(
      (currency) => !query[currency] || inrRateSchema.safeParse(query[currency]).success,
    ),
  );

function inr(value: string | null) {
  if (value === null) return "Not available";
  const [whole = "", fraction] = value.split(".");
  return `INR ${whole.replace(/\B(?=(\d{2})*\d{3}$)/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
}

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
  const query = querySchema.safeParse(await searchParams);
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
        <h1>Advance tax</h1>
        <p>{estimateNote}</p>
        <p>{result.message}</p>
        <Link href="/advance-tax">Reset estimate</Link>
      </>
    );
  }
  const { estimate } = result;
  return (
    <>
      <h1>Advance tax</h1>
      <p>{estimateNote}</p>
      <form method="get">
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
              <td>{receipt.payments}</td>
              <td>{receipt.refunds}</td>
              <td>{receipt.net}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Presumptive eligibility</h2>
      <p>{estimate.eligibility.message}</p>
      <p>
        Rule {estimate.eligibility.citation.ruleId}: {estimate.eligibility.citation.source}. Verify
        with your CA.
      </p>
      <p>
        Gross receipts: {inr(estimate.grossReceiptsInr)}. {estimateNote}
      </p>
      <p>
        Deemed income: {inr(estimate.deemedIncomeInr)}. {estimateNote}
      </p>
      <h2>Advance-tax schedule</h2>
      <p>
        Estimated tax: {inr(estimate.estimatedTaxInr)}. {estimateNote}
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
      <ul>
        {estimate.schedule.map((row) => (
          <li key={row.date}>
            By {row.date}: {row.cumulativePercent}% of the year&apos;s tax
            {row.amountInr !== null && (
              <>
                {" "}
                ({inr(row.amountInr)}) — {estimateNote}
              </>
            )}
          </li>
        ))}
      </ul>
      {estimate.citations
        .filter((citation) => citation.ruleId === "ADVANCE_TAX_DATES")
        .map((citation) => (
          <p key={citation.ruleId}>
            Rule {citation.ruleId}: {citation.source}. Verify with your CA.
          </p>
        ))}
      <Link href="/profile">Edit profile</Link>
    </>
  );
}
