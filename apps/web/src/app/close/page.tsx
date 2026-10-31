import { closePageSchema, reminderStageSchema } from "@niryat/shared";
import { ActionButtons } from "../../components/ActionButtons";
import { CloseButton } from "../../components/CloseButton";
import { CloseRefresher } from "../../components/CloseRefresher";
import { apiGet } from "../../lib/api";
import { daysRemainingLabel } from "../../lib/forms";

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

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
      <h1>Monthly close</h1>
      <p>
        Claude reviews your PayPal month, explains what needs attention and proposes PayPal
        reminders. Nothing is sent to PayPal until you approve it.
      </p>
      <CloseButton />
      {latest?.status === "running" && (
        <>
          <p>Closing {monthLabel(latest.month)}… This page refreshes until it finishes.</p>
          <CloseRefresher />
        </>
      )}
      {summary && summary.focus.length > 0 && (
        <>
          <h2>What to do first</h2>
          <ol>
            {summary.focus.map((item) => (
              <li key={item.label}>
                {item.label}: {item.reason}
              </li>
            ))}
          </ol>
          <p>Priorities suggested by Claude.</p>
        </>
      )}
      <h2>Waiting for your approval</h2>
      {proposed.length === 0 && <p>No PayPal actions to approve.</p>}
      {proposed.map((action) => (
        <section key={action.id}>
          <p>
            Invoice {action.invoiceNumber}: reminder{" "}
            {reminderStageSchema.parse(action.payload.stage)} days before the RBI deadline
          </p>
          <ActionButtons key={action.id} action={action} />
        </section>
      ))}
      <h3>Earlier reminders</h3>
      {earlier.map((action) => (
        <p key={action.id}>
          Invoice {action.invoiceNumber}: {reminderStageSchema.parse(action.payload.stage)}-day
          reminder, {action.status === "done" ? "Accepted by PayPal" : "Rejected"}
        </p>
      ))}
      <h3>Reminder attempts needing attention</h3>
      {attention.map((action) => (
        <section key={action.id}>
          <p>
            Invoice {action.invoiceNumber}: {reminderStageSchema.parse(action.payload.stage)}-day
            reminder
          </p>
          <ActionButtons key={action.id} action={action} />
        </section>
      ))}
      {summary && summaryRun && (
        <>
          <h2>Summary for {monthLabel(summary.month)}</h2>
          {summary.asOf !==
            new Date(summaryRun.startedAt).toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata",
            }) && <p>As of {summary.asOf}</p>}
          <dl>
            <dt>PayPal payments</dt>
            <dd>{summary.payments.count}</dd>
            {summary.payments.totals.map((total) => (
              <div key={total.currency}>
                <dt>Received ({total.currency})</dt>
                <dd>
                  Gross {total.gross}, PayPal fees {total.fee ?? "Not provided by PayPal"}, net{" "}
                  {total.net ?? "Not provided by PayPal"}
                </dd>
              </div>
            ))}
            <dt>Refunds</dt>
            <dd>
              {summary.refunds.count}
              {summary.refunds.totals.map((total) => (
                <span key={total.currency}>
                  ; {total.currency} {total.gross}
                </span>
              ))}
            </dd>
            <dt>Open disputes</dt>
            <dd>{summary.openDisputes}</dd>
            <dt>FIRA</dt>
            <dd>
              {firaLabels[summary.fira.state]}
              {summary.fira.needsConfirmation > 0 &&
                `; ${summary.fira.needsConfirmation} lines need your confirmation`}
              {summary.fira.unmatched > 0 && `; ${summary.fira.unmatched} lines not matched`}
            </dd>
            <dt>Tasks suggested by Claude</dt>
            <dd>{summary.suggestedTasks}</dd>
          </dl>
          {(summary.sync.payments === "failed" || summary.sync.disputes === "failed") && (
            <p role="alert">PayPal sync failed; figures may be incomplete.</p>
          )}
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
                  <td>{deadline.invoiceNumber}</td>
                  <td>{deadline.deadline}</td>
                  <td>{daysRemainingLabel(deadline.daysRemaining)}</td>
                  <td>{deadline.stage ?? "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.citations.map((citation) => (
            <p key={citation.ruleId}>
              Rule {citation.ruleId}: {citation.source}. Verify with your CA.
            </p>
          ))}
          <p>{aiLabels[summary.ai.status]}</p>
          {summary.note && (
            <>
              <h3>Note from Claude</h3>
              <p>{summary.note}</p>
              <p>
                Written by Claude. Every figure on this page comes from PayPal data or Niryat's
                rules.
              </p>
            </>
          )}
        </>
      )}
      <h2>Runs</h2>
      {runs.map((run) => (
        <section key={run.id}>
          <p>
            {runLabels[run.kind]} ({run.trigger}){" "}
            {new Date(run.startedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}:{" "}
            {statusLabels[run.status]}
          </p>
          <details>
            <summary>Tool calls ({run.toolCalls.length})</summary>
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
          </details>
        </section>
      ))}
    </>
  );
}
