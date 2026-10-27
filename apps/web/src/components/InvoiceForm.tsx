"use client";

import { type Client, invoiceCurrencies } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { invoiceBody, sendJson } from "../lib/forms";

export function InvoiceForm({ clients }: { clients: Client[] }) {
  const prefix = useId();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setSubmitting(true);
        setMessage("");
        setReasons([]);
        const result = await sendJson("/api/invoices", "POST", invoiceBody(new FormData(form)));
        setSubmitting(false);
        if (result.ok) {
          form.reset();
          router.refresh();
        } else {
          setMessage(result.message);
          setReasons(result.reasons ?? []);
        }
      }}
    >
      <label htmlFor={`${prefix}-clientId`}>Client</label>
      <select id={`${prefix}-clientId`} name="clientId" required>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name} ({client.country})
            {!client.exportCheck.result.eligible && " — export check blocked"}
          </option>
        ))}
      </select>
      <fieldset>
        <legend>Invoice type</legend>
        <label htmlFor={`${prefix}-one_time`}>One-time</label>
        <input id={`${prefix}-one_time`} name="type" type="radio" value="one_time" defaultChecked />
        <label htmlFor={`${prefix}-recurring`}>Recurring series</label>
        <input id={`${prefix}-recurring`} name="type" type="radio" value="recurring" />
      </fieldset>
      <label htmlFor={`${prefix}-description`}>Description of service</label>
      <textarea id={`${prefix}-description`} name="description" maxLength={200} required />
      <label htmlFor={`${prefix}-sac`}>SAC code (services accounting code)</label>
      <input id={`${prefix}-sac`} name="sac" type="text" pattern="\d{4}(\d{2})?(\d{2})?" required />
      <label htmlFor={`${prefix}-currency`}>Currency</label>
      <select id={`${prefix}-currency`} name="currency" required>
        {invoiceCurrencies.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
      <label htmlFor={`${prefix}-amount`}>Amount (e.g. 1500.00)</label>
      <input id={`${prefix}-amount`} name="amount" type="text" inputMode="decimal" required />
      <fieldset>
        <legend>Recurring series only</legend>
        <label htmlFor={`${prefix}-intervalUnit`}>Repeat every</label>
        <select id={`${prefix}-intervalUnit`} name="intervalUnit" defaultValue="MONTH">
          <option value="WEEK">Week</option>
          <option value="MONTH">Month</option>
          <option value="YEAR">Year</option>
        </select>
        <label htmlFor={`${prefix}-intervalCount`}>Interval count</label>
        <input
          id={`${prefix}-intervalCount`}
          name="intervalCount"
          type="number"
          min={1}
          max={12}
          defaultValue={1}
        />
        <label htmlFor={`${prefix}-totalCycles`}>Number of invoices</label>
        <input id={`${prefix}-totalCycles`} name="totalCycles" type="number" min={1} max={36} />
      </fieldset>
      <button type="submit" disabled={submitting}>
        {submitting ? "Issuing…" : "Issue invoice"}
      </button>
      {message && <p role="alert">{message}</p>}
      {reasons.length > 0 && (
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
