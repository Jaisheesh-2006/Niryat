"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { refundBody, sendJson } from "../lib/forms";

export function RefundForm({ paymentId, currency }: { paymentId: string; currency: string }) {
  const id = useId();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <form
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const body = refundBody(new FormData(event.currentTarget));
        setSubmitting(true);
        setMessage("");
        const result = await sendJson(`/api/payments/${paymentId}/refunds`, "POST", body);
        setSubmitting(false);
        if (result.ok) router.refresh();
        else setMessage(result.message);
      }}
    >
      <label htmlFor={id}>Refund amount ({currency})</label>
      <input id={id} name="amount" type="text" inputMode="decimal" required />
      <button type="submit" disabled={submitting}>
        {submitting ? "Proposing…" : "Propose refund"}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
