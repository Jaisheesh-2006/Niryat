"use client";

import { type Gstr1Preview, gstr1FileRequestSchema, gstr1FileSchema } from "@niryat/shared";
import { useState } from "react";
import { z } from "zod";

const errorSchema = z.object({ error: z.string(), invoices: z.array(z.string()).optional() });

export function Gstr1Download({ preview }: { preview: Gstr1Preview }) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const covered = preview.invoices.filter((invoice) => invoice.lutCovered);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = gstr1FileRequestSchema.safeParse({
      period: preview.period,
      rates: Object.fromEntries(
        covered.map(({ invoiceId }) => [
          invoiceId,
          {
            inrRate: form.get(`inr-${invoiceId}`),
            gstRate: form.get(`gst-${invoiceId}`),
          },
        ]),
      ),
    });
    if (!body.success) {
      setMessage(
        "Enter a valid INR exchange rate and applicable IGST rate for every covered invoice.",
      );
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/gstr1/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.data),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const error = errorSchema.safeParse(json);
        if (error.success && error.data.error === "rates_missing") {
          setMessage(`Enter both rates for invoices: ${(error.data.invoices ?? []).join(", ")}.`);
        } else if (error.success && error.data.error === "empty_period") {
          setMessage("No LUT-covered invoices are available in this period.");
        } else {
          setMessage("Could not prepare the file. Check your rates and refresh the page.");
        }
        return;
      }
      const file = gstr1FileSchema.safeParse(json);
      if (!file.success) throw new Error("Invalid file response");
      const url = URL.createObjectURL(
        new Blob([file.data.csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = file.data.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`Prepared ${file.data.rows} rows.`);
    } catch {
      setMessage("Could not prepare the file. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form method="post" onSubmit={submit}>
      <p id="inr-rate-help">Use the exchange rate your CA uses for the invoice date.</p>
      <p id="gst-rate-help">
        Enter the rate your CA confirms for this service and invoice date. This is not the INR
        exchange rate. Under LUT, no IGST is payable in this file.
      </p>
      {covered.map((invoice) => (
        <fieldset key={invoice.invoiceId} disabled={submitting}>
          <legend>
            Invoice {invoice.number} ({invoice.currency} {invoice.amount})
          </legend>
          <label htmlFor={`inr-${invoice.invoiceId}`}>INR rate for invoice {invoice.number}</label>
          <input
            id={`inr-${invoice.invoiceId}`}
            name={`inr-${invoice.invoiceId}`}
            type="text"
            inputMode="decimal"
            aria-describedby="inr-rate-help"
            required
          />
          <label htmlFor={`gst-${invoice.invoiceId}`}>
            Applicable IGST rate (%) for invoice {invoice.number}
          </label>
          <input
            id={`gst-${invoice.invoiceId}`}
            name={`gst-${invoice.invoiceId}`}
            type="text"
            inputMode="decimal"
            aria-describedby="gst-rate-help"
            required
          />
        </fieldset>
      ))}
      <button type="submit" disabled={submitting || covered.length === 0}>
        Download GSTR-1 Table 6A file
      </button>
      <noscript>
        <p>Enable JavaScript to enter rates and download the file.</p>
      </noscript>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
