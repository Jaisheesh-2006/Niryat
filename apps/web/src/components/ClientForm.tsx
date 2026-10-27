"use client";

import type { Client } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { clientBody, sendJson } from "../lib/forms";

export function ClientForm({ client }: { client?: Client }) {
  const prefix = useId();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const questions = [
    ["supplierInIndia", "Do you supply this service from India?"],
    [
      "clientPresentInIndia",
      "Does this work need the client to be physically present with you in India?",
    ],
    ["paidInForeignCurrency", "Will the client pay you in foreign currency?"],
    [
      "sameEstablishment",
      "Is the client your own branch or another establishment of your business?",
    ],
  ] as const;

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setSubmitting(true);
        setMessage("");
        const result = await sendJson(
          client ? `/api/clients/${client.id}` : "/api/clients",
          client ? "PUT" : "POST",
          clientBody(new FormData(form)),
        );
        setSubmitting(false);
        if (result.ok) {
          if (!client) form.reset();
          router.refresh();
        } else setMessage(result.message);
      }}
    >
      <label htmlFor={`${prefix}-name`}>Client name</label>
      <input
        id={`${prefix}-name`}
        name="name"
        type="text"
        required
        maxLength={200}
        defaultValue={client?.name ?? ""}
      />
      <label htmlFor={`${prefix}-country`}>Client country (2-letter code, e.g. US)</label>
      <input
        id={`${prefix}-country`}
        name="country"
        type="text"
        required
        maxLength={2}
        pattern="[A-Za-z]{2}"
        defaultValue={client?.country ?? ""}
      />
      <label htmlFor={`${prefix}-email`}>Client email (PayPal sends the invoice here)</label>
      <input id={`${prefix}-email`} name="email" type="email" defaultValue={client?.email ?? ""} />
      <label htmlFor={`${prefix}-address`}>Client address</label>
      <textarea
        id={`${prefix}-address`}
        name="address"
        maxLength={500}
        defaultValue={client?.address ?? ""}
      />
      {questions.map(([name, legend]) => (
        <fieldset key={name}>
          <legend>{legend}</legend>
          <label htmlFor={`${prefix}-${name}-yes`}>Yes</label>
          <input
            id={`${prefix}-${name}-yes`}
            name={name}
            type="radio"
            value="yes"
            defaultChecked={client?.exportCheck.answers[name] === true}
          />
          <label htmlFor={`${prefix}-${name}-no`}>No</label>
          <input
            id={`${prefix}-${name}-no`}
            name={name}
            type="radio"
            value="no"
            defaultChecked={client?.exportCheck.answers[name] === false}
          />
        </fieldset>
      ))}
      <button type="submit" disabled={submitting}>
        Check and save
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
