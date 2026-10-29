"use client";

import type { Action } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "../lib/forms";

const labels: Record<Action["paypalAction"], { approve: string; done: string }> = {
  send_invoice: { approve: "Approve and send to PayPal", done: "Sent through PayPal." },
  create_recurring_series: {
    approve: "Approve and start the PayPal series",
    done: "Sent through PayPal.",
  },
  refund_payment: {
    approve: "Approve and refund through PayPal",
    done: "Refund sent to PayPal.",
  },
};

export function ActionButtons({ action }: { action: Action }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  if (action.status === "approved") return <p>Sending to PayPal…</p>;
  if (action.status === "done") return <p>{labels[action.paypalAction].done}</p>;
  if (action.status === "rejected") return <p>Rejected. Nothing was sent to PayPal.</p>;

  async function submit(decision: "approve" | "reject") {
    setSubmitting(true);
    setMessage("");
    const result = await sendJson(`/api/actions/${action.id}/${decision}`, "POST", {});
    setSubmitting(false);
    if (result.ok) router.refresh();
    else setMessage(result.message);
  }

  return (
    <div>
      <h3>Waiting for your approval</h3>
      <p>Niryat will send exactly this request to PayPal. Nothing is sent until you approve.</p>
      <details>
        <summary>Show the PayPal request</summary>
        <pre>{JSON.stringify(action.payload, null, 2)}</pre>
      </details>
      {action.status === "failed" && (
        <p role="alert">
          The last attempt failed ({action.error}). You can approve again to retry.
        </p>
      )}
      <button type="button" disabled={submitting} onClick={() => submit("approve")}>
        {labels[action.paypalAction].approve}
      </button>
      <button type="button" disabled={submitting} onClick={() => submit("reject")}>
        Reject
      </button>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
