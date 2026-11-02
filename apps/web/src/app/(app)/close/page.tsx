import { closePageSchema, reminderStageSchema } from "@niryat/shared";
import { ApprovalCard } from "../../../components/ApprovalCard";
import { CloseButton } from "../../../components/CloseButton";
import { CloseRefresher } from "../../../components/CloseRefresher";
import { EmptyState } from "../../../components/EmptyState";
import { CircleCheck } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { apiGet } from "../../../lib/api";
import { formatDate, formatDateTime, formatMoney, formatMonth } from "../../../lib/format";
import { daysRemainingLabel } from "../../../lib/forms";
import { approvalKind, approvalTitle } from "../../../lib/status";

export const metadata = { title: "Monthly close" };

const firaLabels = {
  covered: "Uploaded",
  missing: "Missing: upload it on the FIRA page",
  not_due: "Not due yet (month in progress)",
  not_needed: "No PayPal payments this month",
};
const aiLabels = {
  used: "Reviewed by Claude.",
  unavailable: "AI is not configured. You can still approve PayPal's standard reminders.",
  budget_exhausted:
    "The monthly AI budget is used up. You can still approve PayPal's standard reminders.",
  failed: "The AI step failed. You can still approve PayPal's standard reminders.",
};
const runLabels = {
  monthly_close: "Monthly close",
  reminders: "Reminders",
  extraction: "Extraction",
  dashboard: "Dashboard",
};
const statusLabels = { running: "Running", completed: "Completed", failed: "Failed" };

export default async function Close() {
  const { runs, approvals } = (await apiGet("/close", closePageSchema)) ?? {
    runs: [],
    approvals: [],
  };
  const latest = runs[0];
  const summaryRun = runs.find((run) => run.kind === "monthly_close" && run.summary !== null);
  const summary = summaryRun?.summary;
  const proposed = approvals.filter((action) => action.status === "proposed");
  const attention = approvals.filter(
    (action) => action.status === "approved" || action.status === "failed",
  );
  const earlier = approvals.filter(
    (action) => action.status === "done" || action.status === "rejected",
  );

  return (
    <>
      <PageHeader
        title="Monthly close"
        description="Claude reviews your PayPal month, explains what needs attention and proposes PayPal reminders. Nothing is sent to PayPal until you approve it."
        actions={<CloseButton />}
      />
      {latest?.status === "running" && (
        <div className="banner" data-tone="neutral" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>Closing {formatMonth(latest.month)}… This page refreshes until it finishes.</p>
          <CloseRefresher />
        </div>
      )}
      {summary && summary.focus.length > 0 && (
        <>
          <h2>What to do first</h2>
          <ol className="close-priorities">
            {summary.focus.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>: <span className="caption">{item.reason}</span>
              </li>
            ))}
          </ol>
          <p className="caption">Priorities suggested by Claude.</p>
        </>
      )}
      <h2>Waiting for your approval</h2>
      {proposed.length === 0 && (
        <EmptyState icon={CircleCheck} title="Nothing to approve">
          Niryat proposes PayPal reminders here when a deadline gets close.
        </EmptyState>
      )}
      {proposed.map((action) => {
        const kind = approvalKind(action);
        return (
          <ApprovalCard
            key={action.id}
            action={action}
            title={approvalTitle({ action, invoiceNumber: action.invoiceNumber })}
            {...(kind ? { kind } : {})}
          />
        );
      })}
      {attention.length > 0 && (
        <section>
          <h2>Needs attention</h2>
          <p className="banner" data-tone="danger" role="alert">
            Check PayPal before taking further action.
          </p>
          {attention.map((action) => {
            const kind = approvalKind(action);
            return (
              <ApprovalCard
                key={action.id}
                action={action}
                title={approvalTitle({ action, invoiceNumber: action.invoiceNumber })}
                {...(kind ? { kind } : {})}
              />
            );
          })}
        </section>
      )}
      {summary && summaryRun && (
        <section className="card">
          <h2>Summary for {formatMonth(summary.month)}</h2>
          {summary.asOf !==
            new Date(summaryRun.startedAt).toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata",
            }) && <p>As of {formatDate(summary.asOf)}</p>}
          <dl className="stat-grid">
            <div className="stat-tile">
              <dt>PayPal payments</dt>
              <dd className="stat-value">{summary.payments.count}</dd>
            </div>
            {summary.payments.totals.map((total) => (
              <div className="stat-tile" key={total.currency}>
                <dt>Received ({total.currency})</dt>
                <dd>
                  Gross {formatMoney(total.gross, total.currency)}, PayPal fees{" "}
                  {total.fee === null
                    ? "Not provided by PayPal"
                    : formatMoney(total.fee, total.currency)}
                  , net{" "}
                  {total.net === null
                    ? "Not provided by PayPal"
                    : formatMoney(total.net, total.currency)}
                </dd>
              </div>
            ))}
            <div className="stat-tile">
              <dt>Refunds</dt>
              <dd>
                {summary.refunds.count}
                {summary.refunds.totals.map((total) => (
                  <span key={total.currency}>; {formatMoney(total.gross, total.currency)}</span>
                ))}
              </dd>
            </div>
            <div className="stat-tile">
              <dt>Open disputes</dt>
              <dd className="stat-value">{summary.openDisputes}</dd>
            </div>
            <div className="stat-tile">
              <dt>FIRA</dt>
              <dd>
                {firaLabels[summary.fira.state]}
                {summary.fira.needsConfirmation > 0 &&
                  `; ${summary.fira.needsConfirmation} lines need your confirmation`}
                {summary.fira.unmatched > 0 && `; ${summary.fira.unmatched} lines not matched`}
              </dd>
            </div>
            <div className="stat-tile">
              <dt>Tasks suggested by Claude</dt>
              <dd className="stat-value">{summary.suggestedTasks}</dd>
            </div>
          </dl>
          {(summary.sync.payments === "failed" || summary.sync.disputes === "failed") && (
            <p role="alert">PayPal sync failed; figures may be incomplete.</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Receive by</th>
                  <th scope="col">Days remaining</th>
                  <th scope="col">Reminder stage</th>
                </tr>
              </thead>
              <tbody>
                {summary.deadlines.map((deadline) => (
                  <tr key={deadline.invoiceId}>
                    <td className="mono">{deadline.invoiceNumber}</td>
                    <td>{formatDate(deadline.deadline)}</td>
                    <td>{daysRemainingLabel(deadline.daysRemaining)}</td>
                    <td>{deadline.stage ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.citations.map((citation) => (
            <p key={citation.ruleId}>
              Rule {citation.ruleId}: {citation.source}. Verify with your CA.
            </p>
          ))}
          <p>{aiLabels[summary.ai.status]}</p>
          {summary.note && (
            <>
              <h3>Note from Claude</h3>
              <p className="suggestion">{summary.note}</p>
              <p>
                Written by Claude. Every figure on this page comes from PayPal data or Niryat's
                rules.
              </p>
            </>
          )}
        </section>
      )}
      <details className="card">
        <summary>History</summary>
        <h3>Earlier reminders</h3>
        {earlier.map((action) => (
          <p key={action.id}>
            Invoice {action.invoiceNumber}: {reminderStageSchema.parse(action.payload.stage)}-day
            reminder, {action.status === "done" ? "Accepted by PayPal" : "Rejected"}
          </p>
        ))}
        <h2>Runs</h2>
        {runs.map((run) => (
          <section key={run.id}>
            <p>
              {runLabels[run.kind]} ({run.trigger}) {formatDateTime(run.startedAt)}:{" "}
              <StatusBadge
                tone={
                  run.status === "failed"
                    ? "danger"
                    : run.status === "completed"
                      ? "success"
                      : "neutral"
                }
                busy={run.status === "running"}
              >
                {statusLabels[run.status]}
              </StatusBadge>
            </p>
            <details>
              <summary>Tool calls ({run.toolCalls.length})</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Actor</th>
                      <th scope="col">Tool</th>
                      <th scope="col">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.toolCalls.map((call) => (
                      <tr key={call.seq}>
                        <td>{call.seq}</td>
                        <td>{call.actor}</td>
                        <td>{call.tool}</td>
                        <td>
                          {call.ok ? "Completed" : "Failed"}
                          <pre>
                            {JSON.stringify({ input: call.input, output: call.output }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        ))}
      </details>
    </>
  );
}
