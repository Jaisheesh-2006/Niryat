"use client";

import {
  type Client,
  type ExtractionResult,
  extractionFieldNames,
  extractionResultSchema,
} from "@niryat/shared";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { sendJson } from "../lib/forms";
import { ClientForm } from "./ClientForm";
import { InvoiceForm } from "./InvoiceForm";

const labels = {
  clientName: "Client name",
  clientEmail: "Client email",
  clientAddress: "Client address",
  clientCountry: "Client country",
  description: "Description of service",
  currency: "Currency",
  amount: "Amount",
  invoiceType: "Invoice type",
  intervalUnit: "Repeat every",
};

export function ExtractPanel({ clients }: { clients: Client[] }) {
  const id = useId();
  const busy = useRef(false);
  const activeExtraction = useRef<ExtractionResult | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [using, setUsing] = useState(false);
  const [created, setCreated] = useState<Client | null>(null);
  const matched = result
    ? clients.find((client) => client.id === result.matchedClientId)
    : undefined;
  const selected = using ? (created ?? matched) : undefined;
  const fields = using ? result?.fields : undefined;
  const defaults = fields
    ? {
        clientId: selected?.id ?? "",
        type: fields.invoiceType.value ?? "one_time",
        description: fields.description.value ?? "",
        currency: fields.currency.value ?? "USD",
        amount: fields.amount.value ?? "",
        intervalUnit: fields.intervalUnit.value ?? "MONTH",
      }
    : undefined;
  const available =
    created && !clients.some((client) => client.id === created.id)
      ? [...clients, created]
      : clients;

  return (
    <>
      <h2>Start from a client email</h2>
      <p>
        Paste the client's email or brief. Claude extracts the details and shows where each one came
        from. Nothing is saved until you check the fields and submit the forms below.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          activeExtraction.current = null;
          setSubmitting(true);
          setMessage("");
          setResult(null);
          setUsing(false);
          setCreated(null);
          const response = await sendJson("/api/extract", "POST", { text }, extractionResultSchema);
          if (response.ok) {
            activeExtraction.current = response.data;
            setResult(response.data);
          } else setMessage(response.message);
          busy.current = false;
          setSubmitting(false);
        }}
      >
        <label htmlFor={id}>Client email or brief</label>
        <textarea
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          minLength={20}
          maxLength={8000}
          required
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Extracting…" : "Extract with Claude"}
        </button>
      </form>
      {message && <p role="alert">{message}</p>}
      {result && (
        <>
          <table>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Extracted value</th>
                <th scope="col">Source text</th>
              </tr>
            </thead>
            <tbody>
              {extractionFieldNames.map((name) => (
                <tr key={name}>
                  <th scope="row">{labels[name]}</th>
                  <td>{result.fields[name].value ?? "Not found"}</td>
                  <td>{result.fields[name].source ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Extracted by Claude from your text. Check every value before you use it.</p>
          <button type="button" onClick={() => setUsing(true)} disabled={using}>
            Use these values
          </button>
          <button
            type="button"
            onClick={() => {
              activeExtraction.current = null;
              setText("");
              setResult(null);
              setUsing(false);
              setCreated(null);
              setMessage("");
            }}
          >
            Discard
          </button>
        </>
      )}
      {using && matched && <p>Matched your existing client {matched.name}.</p>}
      {using && fields && !selected && (
        <>
          <h3>New client from the email</h3>
          <ClientForm
            defaults={{
              name: fields.clientName.value ?? "",
              email: fields.clientEmail.value,
              address: fields.clientAddress.value,
              country: fields.clientCountry.value ?? "",
            }}
            onCreated={(client) => {
              if (result && activeExtraction.current === result) setCreated(client);
            }}
          />
        </>
      )}
      <h2>New invoice</h2>
      {using && !selected ? null : available.length > 0 ? (
        <InvoiceForm
          key={JSON.stringify(defaults)}
          clients={available}
          {...(defaults ? { defaults } : {})}
        />
      ) : (
        <p>
          Add a client first on the <Link href="/clients">Clients</Link> page.
        </p>
      )}
    </>
  );
}
