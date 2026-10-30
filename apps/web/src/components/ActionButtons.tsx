"use client";

import { type Action, agentAdviceSchema } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  send_invoice_reminder: {
    approve: "Send PayPal's standard reminder",
    done: "Reminder request accepted by PayPal.",
  },
};

export function ActionButtons({ action }: { action: Action }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  if (action.paypalAction === "send_invoice_reminder") return <ReminderButtons action={action} />;
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

function ReminderButtons({ action }: { action: Action }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const approvalStarted = useRef(false);
  const advice = agentAdviceSchema.nullable().parse(action.payload.agent);
  const adviceContent = (
    <>
      {advice?.advice === "hold" ? (
        <p>
          <strong>Claude suggests holding this reminder:</strong> {advice.reason}
        </p>
      ) : advice ? (
        <p>Claude: {advice.reason}</p>
      ) : null}
      <p>PayPal sends its standard reminder. Claude's advice stays in Niryat.</p>
    </>
  );

  if (action.status === "approved") {
    return (
      <>
        {adviceContent}
        <p>
          A reminder attempt is in progress or its outcome is unknown. Check PayPal before taking
          further action. This reminder cannot be resent.
        </p>
      </>
    );
  }
  if (action.status === "failed" && action.error === "reminder_outcome_unknown") {
    return (
      <>
        {adviceContent}
        <p>
          PayPal may have accepted this reminder. Check PayPal before taking further action. This
          reminder cannot be resent.
        </p>
      </>
    );
  }
  if (action.status === "done") return <p>{labels[action.paypalAction].done}</p>;
  if (action.status === "rejected") return <p>Rejected. Nothing was sent to PayPal.</p>;

  async function submit(decision: "approve" | "reject") {
    if (submitting || (approvalStarted.current && action.status === "proposed")) return;
    const reminderApproval = decision === "approve";
    if (reminderApproval) approvalStarted.current = true;
    setSubmitting(true);
    setMessage("");
    const result = await sendJson(
      `/api/actions/${action.id}/${decision}`,
      "POST",
      {},
      reminderApproval ? "reminder_approval" : undefined,
    );
    if (reminderApproval) {
      if (!result.ok) setMessage(result.message);
      // refresh returns void; old proposed props must never permit a second attempt.
      try {
        router.refresh();
      } catch {
        setMessage(
          result.ok
            ? "Unable to confirm this reminder's status. Reload this page to check it before taking further action."
            : result.message,
        );
      } finally {
        setSubmitting(false);
      }
    } else {
      setSubmitting(false);
      if (result.ok) router.refresh();
      else setMessage(result.message);
    }
  }

  return (
    <div>
      {action.status === "proposed" && <h3>Waiting for your approval</h3>}
      {adviceContent}
      <details>
        <summary>Show the PayPal request</summary>
        <pre>{JSON.stringify(action.payload.remind, null, 2)}</pre>
      </details>
      {action.status === "failed" && (
        <p role="alert">
          The reminder attempt failed. This reminder cannot be retried. You can reject this
          proposal.
        </p>
      )}
      {action.status === "proposed" && (
        <button
          type="button"
          disabled={submitting || approvalStarted.current}
          onClick={() => submit("approve")}
        >
          {labels[action.paypalAction].approve}
        </button>
      )}
      <button
        type="button"
        disabled={submitting || (approvalStarted.current && action.status === "proposed")}
        onClick={() => submit("reject")}
      >
        Reject
      </button>
      {message && <p role="alert">{message}</p>}
      {approvalStarted.current && !submitting && action.status === "proposed" && (
        <p role="alert">
          Unable to confirm this reminder's status. Reload this page to check it before taking
          further action.
        </p>
      )}
    </div>
  );
}
