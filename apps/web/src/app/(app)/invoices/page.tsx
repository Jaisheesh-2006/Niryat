import {
  clientSchema,
  closePageSchema,
  invoiceViewSchema,
  isSyntheticJudgePayment,
} from "@niryat/shared";
import { Suspense } from "react";
import { z } from "zod";
import { ApprovalCard } from "../../../components/ApprovalCard";
import { CardBoundary } from "../../../components/CardBoundary";
import { EmptyState } from "../../../components/EmptyState";
import { ExtractPanel } from "../../../components/ExtractPanel";
import { FileText } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { RefundForm } from "../../../components/RefundForm";
import { StatusBadge } from "../../../components/StatusBadge";
import { SyncFreshness } from "../../../components/SyncFreshness";
import { Term } from "../../../components/Term";
import { apiGet } from "../../../lib/api";
import { formatDate, formatDateTime, formatMoney } from "../../../lib/format";
import { daysRemainingLabel } from "../../../lib/forms";
import { approvalKind, approvalTitle, invoiceFira, invoiceStatus } from "../../../lib/status";

export const metadata = { title: "Invoices" };

export default async function Invoices() {
  const [invoices, clients, close] = await Promise.all([
    apiGet("/invoices", z.array(invoiceViewSchema)),
    apiGet("/clients", z.array(clientSchema)),
    apiGet("/close", closePageSchema),
  ]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Prepare invoices, review payment records and approve each PayPal action yourself."
        actions={
          <details className="card" open={(invoices ?? []).length === 0}>
            <summary>New invoice</summary>
            <ExtractPanel clients={clients ?? []} />
          </details>
        }
      />
      <CardBoundary title="PayPal data freshness">
        <Suspense fallback={<p>Loading PayPal data freshness…</p>}>
          <SyncFreshness />
        </Suspense>
      </CardBoundary>
      <details>
        <summary>What these payment terms mean</summary>
        <p>
          <Term term="fira" />
        </p>
        <p>
          <Term term="realisation" />
        </p>
        <p>
          <Term term="credit_note" />
        </p>
      </details>
      {(invoices ?? []).length === 0 && (
        <EmptyState icon={FileText} title="No invoices yet">
          Paste a client email and Claude fills in the invoice for you.
        </EmptyState>
      )}
      {(invoices ?? []).map((invoice) => (
        <section className="card" key={invoice.id} id={`invoice-${invoice.id}`}>
          <div className="card-header">
            <h2>
              <span className="mono">{invoice.number}</span> · {invoice.clientName}
            </h2>
            <span className="num">{formatMoney(invoice.amount, invoice.currency)}</span>
          </div>
          <p>
            <time dateTime={invoice.date}>{formatDate(invoice.date)}</time>
          </p>
          <StatusBadge tone={invoiceStatus[invoice.status].tone}>
            {invoiceStatus[invoice.status].label}
          </StatusBadge>{" "}
          <StatusBadge tone={invoiceFira[invoice.firaStatus].tone}>
            {invoiceFira[invoice.firaStatus].label}
          </StatusBadge>
          {invoice.compliance.deadline && (
            <>
              <h3>RBI deadline</h3>
              <dl>
                <dt>Receive full payment by</dt>
                <dd>{formatDate(invoice.compliance.deadline.deadline)}</dd>
                <dt>Days remaining</dt>
                <dd>{daysRemainingLabel(invoice.compliance.deadline.daysRemaining)}</dd>
              </dl>
              <p>{invoice.compliance.deadline.message}</p>
              <p>
                Rule {invoice.compliance.deadline.citation.ruleId}:{" "}
                {invoice.compliance.deadline.citation.source}. Verify with your CA.
              </p>
            </>
          )}
          {[
            ...(invoice.action ? [invoice.action] : []),
            ...invoice.refundActions,
            ...(close?.approvals ?? []).filter((action) => action.invoiceId === invoice.id),
          ].map((action) => {
            const kind = approvalKind(action);
            return (
              <ApprovalCard
                key={action.id}
                action={action}
                title={approvalTitle({
                  action,
                  invoiceNumber: invoice.number,
                  clientName: invoice.clientName,
                })}
                {...(kind ? { kind } : {})}
                facts={[
                  {
                    label: action.paypalAction === "refund_payment" ? "Invoice amount" : "Amount",
                    value: formatMoney(invoice.amount, invoice.currency),
                  },
                  { label: "Invoice date", value: formatDate(invoice.date) },
                  ...(invoice.compliance.deadline
                    ? [
                        {
                          label: "RBI deadline",
                          value: daysRemainingLabel(invoice.compliance.deadline.daysRemaining),
                        },
                      ]
                    : []),
                ]}
              />
            );
          })}
          {invoice.compliance.disputeAlerts.map((alert) => (
            <p className="banner" data-tone="danger" role="alert" key={alert.paypalDisputeId}>
              {alert.message}
            </p>
          ))}
          <details>
            <summary>Details</summary>
            <dl>
              <dt>Type</dt>
              <dd>
                {invoice.type === "recurring" && invoice.recurrence
                  ? `Recurring: every ${invoice.recurrence.intervalCount} ${invoice.recurrence.intervalUnit.toLowerCase()}, ${invoice.recurrence.totalCycles} invoices`
                  : "One-time"}
              </dd>
              <dt>Paid so far</dt>
              <dd className="num">{formatMoney(invoice.paidTotal, invoice.currency)}</dd>
              <dt>GST invoice PDF</dt>
              <dd>
                {invoice.pdfUrl !== null ? (
                  <a href={invoice.pdfUrl}>Open PDF</a>
                ) : (
                  "Not generated (demo invoice)"
                )}
              </dd>
            </dl>
            <h3>Payments</h3>
            {invoice.payments.length === 0 ? (
              <p>No payments recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">PayPal transaction</th>
                      <th scope="col">Received</th>
                      <th scope="col">Gross</th>
                      <th scope="col">PayPal fee</th>
                      <th scope="col">Net</th>
                      <th scope="col">FX rate</th>
                      <th scope="col">FIRA</th>
                      <th scope="col">Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="mono">{payment.paypalTxnId}</td>
                        <td>{formatDateTime(payment.receivedAt)}</td>
                        <td className="num">{formatMoney(payment.gross, payment.currency)}</td>
                        <td className="num">
                          {payment.fee === null
                            ? "Not provided by PayPal"
                            : formatMoney(payment.fee, payment.currency)}
                        </td>
                        <td className="num">
                          {payment.net === null
                            ? "Not provided by PayPal"
                            : formatMoney(payment.net, payment.currency)}
                        </td>
                        <td>{payment.fxRate ?? "Not provided by PayPal"}</td>
                        <td>
                          {payment.fira?.state === "matched"
                            ? "Matched"
                            : payment.fira?.state === "needs_confirmation"
                              ? "Needs your confirmation"
                              : "Not matched"}
                        </td>
                        <td>
                          {!isSyntheticJudgePayment(payment.paypalTxnId) &&
                            !invoice.refundActions.some(
                              (action) =>
                                action.paymentId === payment.id &&
                                (action.status === "proposed" ||
                                  action.status === "approved" ||
                                  action.status === "failed"),
                            ) && <RefundForm paymentId={payment.id} currency={payment.currency} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {invoice.refunds.length > 0 && (
              <>
                <h3>Refunds</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">PayPal refund</th>
                        <th scope="col">Refunded on</th>
                        <th scope="col">Amount</th>
                        <th scope="col">PayPal fee returned</th>
                        <th scope="col">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.refunds.map((refund) => (
                        <tr key={refund.id}>
                          <td className="mono">{refund.paypalTxnId}</td>
                          <td>{formatDateTime(refund.receivedAt)}</td>
                          <td className="num">{formatMoney(refund.gross, refund.currency)}</td>
                          <td className="num">
                            {refund.fee === null
                              ? "Not provided by PayPal"
                              : formatMoney(refund.fee, refund.currency)}
                          </td>
                          <td className="num">
                            {refund.net === null
                              ? "Not provided by PayPal"
                              : formatMoney(refund.net, refund.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <h3>Export money received</h3>
            <dl>
              <dt>Export value</dt>
              <dd className="num">
                {formatMoney(invoice.compliance.realisation.exportValue, invoice.currency)}
              </dd>
              <dt>Received through PayPal, net of refunds</dt>
              <dd className="num">
                {formatMoney(invoice.compliance.realisation.received, invoice.currency)}
              </dd>
              <dt>Not yet received</dt>
              <dd className="num">
                {formatMoney(invoice.compliance.realisation.shortfall, invoice.currency)}
              </dd>
            </dl>
            {invoice.compliance.realisation.message && (
              <p>{invoice.compliance.realisation.message}</p>
            )}
            <p>
              Rule {invoice.compliance.realisation.citation.ruleId}:{" "}
              {invoice.compliance.realisation.citation.source}. Verify with your CA.
            </p>
            {invoice.compliance.creditNotes.map((note) => (
              <div key={note.refundId}>
                <h3>GST credit note</h3>
                <dl>
                  <dt>Against invoice</dt>
                  <dd>
                    {note.originalInvoice} dated {formatDate(note.originalDate)}
                  </dd>
                  <dt>Credit value</dt>
                  <dd>{note.value}</dd>
                  <dt>IGST</dt>
                  <dd>{note.igst}</dd>
                  <dt>Declare by</dt>
                  <dd>{formatDate(note.declareBy)}</dd>
                </dl>
                <p>{note.message}</p>
                <p>
                  Rule {note.citation.ruleId}: {note.citation.source}. Verify with your CA.
                </p>
              </div>
            ))}
            {invoice.disputes.length > 0 && (
              <>
                <h3>Disputes</h3>
                {invoice.disputes.map((dispute) => {
                  const alert = invoice.compliance.disputeAlerts.find(
                    (entry) => entry.paypalDisputeId === dispute.paypalDisputeId,
                  );
                  return (
                    <div key={dispute.id}>
                      <dl>
                        <dt>PayPal dispute</dt>
                        <dd className="mono">{dispute.paypalDisputeId}</dd>
                        <dt>Amount</dt>
                        <dd>{formatMoney(dispute.amount, dispute.currency)}</dd>
                        <dt>Reason</dt>
                        <dd>{dispute.reason}</dd>
                        <dt>Status</dt>
                        <dd>{dispute.status}</dd>
                        <dt>Respond by</dt>
                        <dd>
                          {dispute.responseDueDate
                            ? formatDate(dispute.responseDueDate)
                            : "Not given"}
                        </dd>
                        <dt>Outcome</dt>
                        <dd>{dispute.outcome ?? "Open"}</dd>
                      </dl>
                      {alert && (
                        <p>
                          Rule {alert.citation.ruleId}: {alert.citation.source}. Verify with your
                          CA.
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </details>
        </section>
      ))}
    </>
  );
}
