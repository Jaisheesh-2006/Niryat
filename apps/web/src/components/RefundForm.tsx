"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { refundBody, sendJson } from "../lib/forms";

export function RefundForm({ paymentId, currency }: { paymentId: string; currency: string }) {
  const id = useId();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = refundBody(new FormData(event.currentTarget));
        return startTransition(async () => {
          setMessage("");
          const result = await sendJson(`/api/payments/${paymentId}/refunds`, "POST", body);
          if (result.ok) startTransition(() => router.refresh());
          else setMessage(result.message);
        });
      }}
    >
      <label htmlFor={id}>Refund amount ({currency})</label>
      <input
        id={id}
        name="amount"
        type="text"
        inputMode="decimal"
        aria-describedby={message ? `${id}-error` : undefined}
        required
      />
      <button type="submit" disabled={isPending}>
        {isPending ? "Proposing…" : "Propose refund"}
      </button>
      {message && (
        <p id={`${id}-error`} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
