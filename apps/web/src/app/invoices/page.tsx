import { clientSchema, invoiceViewSchema } from "@niryat/shared";
import Link from "next/link";
import { z } from "zod";
import { ActionButtons } from "../../components/ActionButtons";
import { InvoiceForm } from "../../components/InvoiceForm";
import { RefundForm } from "../../components/RefundForm";
import { apiGet } from "../../lib/api";

export default async function Invoices() {
  const [invoices, clients] = await Promise.all([
    apiGet("/invoices", z.array(invoiceViewSchema)),
    apiGet("/clients", z.array(clientSchema)),
  ]);
  const statusLabels = {
    issued: "Issued",
    sent: "Sent through PayPal",
    partially_paid: "Partly paid",
    paid: "Paid",
    partially_refunded: "Partly refunded",
    refunded: "Refunded",
  };

  return (
    <>
      <h1>Invoices</h1>
      <h2>New invoice</h2>
      {clients && clients.length > 0 ? (
        <InvoiceForm clients={clients} />
      ) : (
        <p>
          Add a client first on the <Link href="/clients">Clients</Link> page.
        </p>
      )}
      {(invoices ?? []).map((invoice) => (
        <section key={invoice.id} id={`invoice-${invoice.id}`}>
          <h2>
            {invoice.number} · {invoice.clientName}
          </h2>
          <dl>
            <dt>Date</dt>
            <dd>{invoice.date}</dd>
            <dt>Amount</dt>
            <dd>
              {invoice.currency} {invoice.amount}
            </dd>
            <dt>Type</dt>
            <dd>
              {invoice.type === "recurring" && invoice.recurrence
                ? `Recurring: every ${invoice.recurrence.intervalCount} ${invoice.recurrence.intervalUnit.toLowerCase()}, ${invoice.recurrence.totalCycles} invoices`
                : "One-time"}
            </dd>
            <dt>Status</dt>
            <dd>{statusLabels[invoice.status]}</dd>
            <dt>Paid so far</dt>
            <dd>
              {invoice.currency} {invoice.paidTotal}
            </dd>
            <dt>GST invoice PDF</dt>
            <dd>
              <a href={invoice.pdfUrl}>Open PDF</a>
            </dd>
          </dl>
          {invoice.action && <ActionButtons action={invoice.action} />}
          <h3>Payments</h3>
          {invoice.payments.length === 0 ? (
            <p>No payments recorded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">PayPal transaction</th>
                  <th scope="col">Received</th>
                  <th scope="col">Gross</th>
                  <th scope="col">PayPal fee</th>
                  <th scope="col">Net</th>
                  <th scope="col">FX rate</th>
                  <th scope="col">Refund</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paypalTxnId}</td>
                    <td>{payment.receivedAt}</td>
                    <td>
                      {payment.currency} {payment.gross}
                    </td>
                    <td>{payment.fee ?? "Not provided by PayPal"}</td>
                    <td>{payment.net ?? "Not provided by PayPal"}</td>
                    <td>{payment.fxRate ?? "Not provided by PayPal"}</td>
                    <td>
                      {!invoice.refundActions.some(
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
          )}
          {invoice.refundActions.length > 0 && (
            <>
              <h3>Refund approvals</h3>
              {invoice.refundActions.map((action) => (
                <ActionButtons key={action.id} action={action} />
              ))}
            </>
          )}
          {invoice.refunds.length > 0 && (
            <>
              <h3>Refunds</h3>
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
                      <td>{refund.paypalTxnId}</td>
                      <td>{refund.receivedAt}</td>
                      <td>
                        {refund.currency} {refund.gross}
                      </td>
                      <td>{refund.fee ?? "Not provided by PayPal"}</td>
                      <td>{refund.net ?? "Not provided by PayPal"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <h3>Realisation</h3>
          <dl>
            <dt>Export value</dt>
            <dd>
              {invoice.currency} {invoice.compliance.realisation.exportValue}
            </dd>
            <dt>Received through PayPal, net of refunds</dt>
            <dd>
              {invoice.currency} {invoice.compliance.realisation.received}
            </dd>
            <dt>Not yet received</dt>
            <dd>
              {invoice.currency} {invoice.compliance.realisation.shortfall}
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
                  {note.originalInvoice} dated {note.originalDate}
                </dd>
                <dt>Credit value</dt>
                <dd>{note.value}</dd>
                <dt>IGST</dt>
                <dd>{note.igst}</dd>
                <dt>Declare by</dt>
                <dd>{note.declareBy}</dd>
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
                    {alert && <p role="alert">{alert.message}</p>}
                    <dl>
                      <dt>PayPal dispute</dt>
                      <dd>{dispute.paypalDisputeId}</dd>
                      <dt>Amount</dt>
                      <dd>
                        {dispute.currency} {dispute.amount}
                      </dd>
                      <dt>Reason</dt>
                      <dd>{dispute.reason}</dd>
                      <dt>Status</dt>
                      <dd>{dispute.status}</dd>
                      <dt>Respond by</dt>
                      <dd>{dispute.responseDueDate ?? "Not given"}</dd>
                      <dt>Outcome</dt>
                      <dd>{dispute.outcome ?? "Open"}</dd>
                    </dl>
                    {alert && (
                      <p>
                        Rule {alert.citation.ruleId}: {alert.citation.source}. Verify with your CA.
                      </p>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </section>
      ))}
    </>
  );
}
