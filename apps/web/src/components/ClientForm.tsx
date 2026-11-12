"use client";

import { type Client, clientSchema } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { clientBody, sendJson } from "../lib/forms";

export function ClientForm({
  client,
  defaults,
  onCreated,
}: {
  client?: Client;
  defaults?: Partial<Pick<Client, "name" | "country" | "email" | "address">>;
  onCreated?: (client: Client) => void;
}) {
  const prefix = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
      aria-describedby={message ? `${prefix}-error` : undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        return startTransition(async () => {
          setMessage("");
          const url = client ? `/api/clients/${client.id}` : "/api/clients";
          const method = client ? "PUT" : "POST";
          const body = clientBody(new FormData(form));
          const result =
            onCreated && !client
              ? await sendJson(url, method, body, clientSchema)
              : await sendJson(url, method, body);
          if (result.ok) {
            if (result.data) onCreated?.(result.data);
            if (!client) form.reset();
            startTransition(() => router.refresh());
          } else setMessage(result.message);
        });
      }}
    >
      <label htmlFor={`${prefix}-name`}>Client name</label>
      <input
        id={`${prefix}-name`}
        name="name"
        type="text"
        required
        maxLength={200}
        defaultValue={client?.name ?? defaults?.name ?? ""}
      />
      <label htmlFor={`${prefix}-country`}>Client country (2-letter code, e.g. US)</label>
      <input
        id={`${prefix}-country`}
        name="country"
        type="text"
        required
        maxLength={2}
        pattern="[A-Za-z]{2}"
        defaultValue={client?.country ?? defaults?.country ?? ""}
      />
      <label htmlFor={`${prefix}-email`}>Client email (PayPal sends the invoice here)</label>
      <input
        id={`${prefix}-email`}
        name="email"
        type="email"
        defaultValue={client?.email ?? defaults?.email ?? ""}
      />
      <label htmlFor={`${prefix}-address`}>Client address</label>
      <textarea
        id={`${prefix}-address`}
        name="address"
        maxLength={500}
        defaultValue={client?.address ?? defaults?.address ?? ""}
      />
      {questions.map(([name, legend]) => (
        <fieldset key={name}>
          <legend>{legend}</legend>
          <label htmlFor={`${prefix}-${name}-yes`}>
            <input
              id={`${prefix}-${name}-yes`}
              name={name}
              type="radio"
              value="yes"
              defaultChecked={client?.exportCheck.answers[name] === true}
            />
            Yes
          </label>
          <label htmlFor={`${prefix}-${name}-no`}>
            <input
              id={`${prefix}-${name}-no`}
              name={name}
              type="radio"
              value="no"
              defaultChecked={client?.exportCheck.answers[name] === false}
            />
            No
          </label>
        </fieldset>
      ))}
      <button type="submit" disabled={isPending}>
        Check and save
      </button>
      {message && (
        <p id={`${prefix}-error`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
