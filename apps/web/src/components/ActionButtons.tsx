"use client";

import { type Action, agentAdviceSchema } from "@niryat/shared";
import { useRouter } from "next/navigation";
import { type ReactNode, type RefObject, useEffect, useRef, useState, useTransition } from "react";
import { sendJson } from "../lib/forms";
import { actionStatusLabel, actionTone } from "../lib/status";
import { Lightbulb } from "./icons";
import { StatusBadge } from "./StatusBadge";

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

export function ActionButtons({ action, inCard = false }: { action: Action; inCard?: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const decided = useRef(false);
  const previousStatus = useRef(action.status);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (decided.current && (action.status !== previousStatus.current || message)) {
      outcomeRef.current?.focus();
    }
    previousStatus.current = action.status;
  }, [action.status, message]);
  if (action.paypalAction === "send_invoice_reminder")
    return <ReminderButtons action={action} inCard={inCard} />;
  if (action.status === "approved")
    return (
      <p ref={outcomeRef} tabIndex={-1}>
        Sending to PayPal…
      </p>
    );
  if (action.status === "done")
    return (
      <ActionOutcome action={action} inCard={inCard} outcomeRef={outcomeRef}>
        {labels[action.paypalAction].done}
      </ActionOutcome>
    );
  if (action.status === "rejected")
    return (
      <ActionOutcome action={action} inCard={inCard} outcomeRef={outcomeRef}>
        Rejected. Nothing was sent to PayPal.
      </ActionOutcome>
    );

  async function submit(decision: "approve" | "reject") {
    decided.current = true;
    setSubmitting(true);
    setMessage("");
    const result = await sendJson(`/api/actions/${action.id}/${decision}`, "POST", {});
    setSubmitting(false);
    if (result.ok) startTransition(() => router.refresh());
    else setMessage(result.message);
  }

  return (
    <div className={inCard ? "approval-controls" : undefined}>
      {!inCard && <h3>Waiting for your approval</h3>}
      <p>Niryat will send exactly this request to PayPal. Nothing is sent until you approve.</p>
      <details>
        <summary className="btn" data-variant="ghost">
          Show the PayPal request
        </summary>
        <pre>{JSON.stringify(action.payload, null, 2)}</pre>
      </details>
      {action.status === "failed" && (
        <p
          className="banner"
          data-tone="danger"
          role="alert"
          ref={message ? undefined : outcomeRef}
          tabIndex={-1}
        >
          The last attempt failed ({action.error}). You can approve again to retry.
        </p>
      )}
      {inCard && action.status === "proposed" && (
        <p className="approval-caption">Nothing is sent to PayPal until you approve.</p>
      )}
      <button
        className="btn"
        data-variant={action.paypalAction === "refund_payment" ? "danger" : "decision"}
        type="button"
        disabled={submitting || isPending}
        onClick={() => submit("approve")}
      >
        {labels[action.paypalAction].approve}
      </button>
      <button
        className="btn"
        data-variant="secondary"
        type="button"
        disabled={submitting || isPending}
        onClick={() => submit("reject")}
      >
        Reject
      </button>
      {message && (
        <p className="banner" data-tone="danger" role="alert" ref={outcomeRef} tabIndex={-1}>
          {message}
        </p>
      )}
    </div>
  );
}

function ReminderButtons({ action, inCard }: { action: Action; inCard: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const decided = useRef(false);
  const previousStatus = useRef(action.status);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const approvalStarted = useRef(false);
  useEffect(() => {
    if (
      decided.current &&
      (action.status !== previousStatus.current ||
        message ||
        (approvalStarted.current && !submitting && action.status === "proposed"))
    ) {
      outcomeRef.current?.focus();
    }
    previousStatus.current = action.status;
  }, [action.status, message, submitting]);
  const advice = agentAdviceSchema.nullable().parse(action.payload.agent);
  const adviceContent = (
    <>
      {advice && (
        <div className="suggestion">
          <p>
            <Lightbulb /> Suggestion from Claude
          </p>
          {advice.advice === "hold" ? (
            <p>
              <strong>Claude suggests holding this reminder:</strong> {advice.reason}
            </p>
          ) : (
            <p>Claude: {advice.reason}</p>
          )}
        </div>
      )}
      <p>PayPal sends its standard reminder. Claude's advice stays in Niryat.</p>
    </>
  );

  if (action.status === "approved") {
    return (
      <>
        {adviceContent}
        <p className="banner" data-tone="attention" ref={outcomeRef} tabIndex={-1}>
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
        <p className="banner" data-tone="danger" ref={outcomeRef} tabIndex={-1}>
          PayPal may have accepted this reminder. Check PayPal before taking further action. This
          reminder cannot be resent.
        </p>
      </>
    );
  }
  if (action.status === "done")
    return (
      <ActionOutcome action={action} inCard={inCard} outcomeRef={outcomeRef}>
        {labels[action.paypalAction].done}
      </ActionOutcome>
    );
  if (action.status === "rejected")
    return (
      <ActionOutcome action={action} inCard={inCard} outcomeRef={outcomeRef}>
        Rejected. Nothing was sent to PayPal.
      </ActionOutcome>
    );

  async function submit(decision: "approve" | "reject") {
    if (submitting || isPending || (approvalStarted.current && action.status === "proposed"))
      return;
    const reminderApproval = decision === "approve";
    if (reminderApproval) approvalStarted.current = true;
    decided.current = true;
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
      startTransition(() => {
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
      });
    } else {
      setSubmitting(false);
      if (result.ok) startTransition(() => router.refresh());
      else setMessage(result.message);
    }
  }

  return (
    <div className={inCard ? "approval-controls" : undefined}>
      {action.status === "proposed" && !inCard && <h3>Waiting for your approval</h3>}
      {adviceContent}
      <details>
        <summary className="btn" data-variant="ghost">
          Show the PayPal request
        </summary>
        <pre>{JSON.stringify(action.payload.remind, null, 2)}</pre>
      </details>
      {action.status === "failed" && (
        <p
          className="banner"
          data-tone="danger"
          role="alert"
          ref={message ? undefined : outcomeRef}
          tabIndex={-1}
        >
          The reminder attempt failed. This reminder cannot be retried. You can reject this
          proposal.
        </p>
      )}
      {inCard && action.status === "proposed" && (
        <p className="approval-caption">Nothing is sent to PayPal until you approve.</p>
      )}
      {action.status === "proposed" && (
        <button
          className="btn"
          data-variant="decision"
          type="button"
          disabled={submitting || isPending || approvalStarted.current}
          onClick={() => submit("approve")}
        >
          {labels[action.paypalAction].approve}
        </button>
      )}
      <button
        className="btn"
        data-variant="secondary"
        type="button"
        disabled={
          submitting || isPending || (approvalStarted.current && action.status === "proposed")
        }
        onClick={() => submit("reject")}
      >
        Reject
      </button>
      {message && (
        <p className="banner" data-tone="danger" role="alert" ref={outcomeRef} tabIndex={-1}>
          {message}
        </p>
      )}
      {approvalStarted.current && !submitting && action.status === "proposed" && (
        <p
          className="banner"
          data-tone="danger"
          role="alert"
          ref={message ? undefined : outcomeRef}
          tabIndex={-1}
        >
          Unable to confirm this reminder's status. Reload this page to check it before taking
          further action.
        </p>
      )}
    </div>
  );
}

function ActionOutcome({
  action,
  inCard,
  outcomeRef,
  children,
}: {
  action: Action;
  inCard: boolean;
  outcomeRef: RefObject<HTMLParagraphElement | null>;
  children: ReactNode;
}) {
  const compact = inCard && (action.status === "done" || action.status === "rejected");
  return (
    <p className={compact ? "approval-outcome" : undefined} ref={outcomeRef} tabIndex={-1}>
      {compact ? (
        <>
          <StatusBadge tone={actionTone(action.status)}>
            {actionStatusLabel(action.status)}
          </StatusBadge>
          <span className="visually-hidden">{children}</span>
        </>
      ) : (
        children
      )}
    </p>
  );
}
