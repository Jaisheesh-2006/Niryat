import { clientSchema, invoiceSchema } from "@niryat/shared";
import Link from "next/link";
import { z } from "zod";
import { ActionButtons } from "../../components/ActionButtons";
import { InvoiceForm } from "../../components/InvoiceForm";
import { apiGet } from "../../lib/api";

export default async function Invoices() {
  const [invoices, clients] = await Promise.all([
    apiGet("/invoices", z.array(invoiceSchema)),
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
        <section key={invoice.id}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </>
  );
}
