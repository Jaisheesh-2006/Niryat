import {
  calendarEventSchema,
  caPortfolioSchema,
  healthReportSchema,
  invoiceViewSchema,
} from "@niryat/shared";
import Link from "next/link";
import { CaStopManagingButton } from "../../../../../components/CaStopManagingButton";
import { Gstr1Report, gstr1PreviewFor } from "../../../../../components/Gstr1Report";
import { PageHeader } from "../../../../../components/PageHeader";
import { StatusBadge } from "../../../../../components/StatusBadge";
import { Term } from "../../../../../components/Term";
import { apiGet } from "../../../../../lib/api";
import { deadlineList } from "../../../../../lib/calendar";
import { formatDate, formatMoney } from "../../../../../lib/format";
import { healthSeverity, invoiceFira, invoiceStatus } from "../../../../../lib/status";

export const metadata = { title: "Client records" };

// The API omits approval payloads and PDF links for a CA.
const caInvoicesSchema = invoiceViewSchema
  .omit({ action: true, refundActions: true, pdfUrl: true })
  .array();

function NoAccess() {
  return (
    <>
      <PageHeader
        title="Client records"
        description="View the records a freelancer has shared with you."
      />
      <p>You no longer have access to this client.</p>
      <Link href="/ca">Back to your clients</Link>
    </>
  );
}

export default async function CaClient({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { period }] = await Promise.all([params, searchParams]);
  const portfolio = await apiGet("/ca/portfolio", caPortfolioSchema, "/ca/login");
  const client = portfolio?.find((row) => row.freelancerId === id);
  if (!client) return <NoAccess />;
  const query = `?client=${client.freelancerId}`;
  const [invoices, health, events, gstr1] = await Promise.all([
    apiGet(`/invoices${query}`, caInvoicesSchema, "/ca/login"),
    apiGet(`/health-check${query}`, healthReportSchema, "/ca/login"),
    apiGet(`/calendar${query}`, calendarEventSchema.array(), "/ca/login"),
    gstr1PreviewFor(typeof period === "string" ? period : undefined, client.freelancerId),
  ]);
  // Sharing can end between the portfolio read and these reads.
  if (invoices === null || events === null) return <NoAccess />;
  const deadlines = deadlineList(events, 10);

  return (
    <>
      <PageHeader
        title={client.name ?? client.email}
        description={
          <>
            Read-only. Shared since{" "}
            <time dateTime={client.sharedSince}>{formatDate(client.sharedSince)}</time>.
          </>
        }
        actions={<CaStopManagingButton freelancerId={client.freelancerId} linkId={client.linkId} />}
      />
      <details>
        <summary>What these record terms mean</summary>
        <p>
          <Term term="lut" />
        </p>
        <p>
          <Term term="gstin" />
        </p>
        <p>
          <Term term="purpose_code" />
        </p>
        <p>
          <Term term="fira" />
        </p>
        <p>
          <Term term="realisation" />
        </p>
        <p>
          <Term term="credit_note" />
        </p>
        <p>
          <Term term="gstr1" />
        </p>
        <p>
          <Term term="advance_tax" />
        </p>
        <p>
          <Term term="presumptive" />
        </p>
      </details>
      <section aria-labelledby="client-health">
        <h2 id="client-health">Health</h2>
        {health === null ? (
          <p>Your client hasn't completed their profile yet.</p>
        ) : (
          <>
            <p className="display">{health.score} / 100</p>
            <p className="caption">Checked on {formatDate(health.checkedOn)}</p>
            {health.flags.length === 0 ? (
              <p>No issues found in these checks.</p>
            ) : (
              [...health.flags]
                .sort((a, b) => healthSeverity[a.severity].order - healthSeverity[b.severity].order)
                .map(({ code, severity, message, citation, note }) => (
                  <article className="card" key={code}>
                    <StatusBadge tone={healthSeverity[severity].tone}>
                      {healthSeverity[severity].label}
                    </StatusBadge>
                    <p>
                      <strong>{message}</strong>
                    </p>
                    <p className="caption">
                      Rule <span className="mono">{citation.ruleId}</span>: {citation.source}
                    </p>
                    <p className="caption">
                      <em>{note}</em>
                    </p>
                  </article>
                ))
            )}
          </>
        )}
      </section>

      <section aria-labelledby="client-invoices">
        <h2 id="client-invoices">Invoices</h2>
        {invoices.length === 0 ? (
          <p>No invoices yet.</p>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Date</th>
                  <th scope="col">Client</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Received</th>
                  <th scope="col">Status</th>
                  <th scope="col">RBI deadline</th>
                  <th scope="col">Payment proof</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="mono">{invoice.number}</td>
                    <td>{formatDate(invoice.date)}</td>
                    <td>{invoice.clientName}</td>
                    <td className="num">{formatMoney(invoice.amount, invoice.currency)}</td>
                    <td className="num">
                      {formatMoney(invoice.compliance.realisation.received, invoice.currency)}
                    </td>
                    <td>
                      <StatusBadge tone={invoiceStatus[invoice.status].tone}>
                        {invoiceStatus[invoice.status].label}
                      </StatusBadge>
                    </td>
                    <td>
                      {invoice.compliance.deadline
                        ? formatDate(invoice.compliance.deadline.deadline)
                        : "None"}
                      {invoice.compliance.deadline?.overdue && (
                        <>
                          {" "}
                          <StatusBadge tone="danger">Overdue</StatusBadge>
                        </>
                      )}
                    </td>
                    <td>
                      <StatusBadge tone={invoiceFira[invoice.firaStatus].tone}>
                        {invoiceFira[invoice.firaStatus].label}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="client-deadlines">
        <h2 id="client-deadlines">Overdue and next 10 deadlines</h2>
        {deadlines.length === 0 ? (
          <p>No overdue or upcoming deadlines.</p>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Deadline</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <time dateTime={event.date}>{formatDate(event.date)}</time>
                    </td>
                    <td>{event.title}</td>
                    <td>
                      <StatusBadge tone={event.state === "overdue" ? "danger" : "neutral"}>
                        {event.state === "overdue" ? "Overdue" : "Upcoming"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="client-gstr1">
        <h2 id="client-gstr1">GST sales return</h2>
        {gstr1.ok ? (
          <Gstr1Report preview={gstr1.preview} client={client.freelancerId} />
        ) : (
          <p>{gstr1.message}</p>
        )}
      </section>

      <section aria-labelledby="client-approvals">
        <h2 id="client-approvals">Approvals</h2>
        <p className="display">{client.pendingApprovals}</p>
        <p>Waiting for your client to approve in Niryat.</p>
      </section>
    </>
  );
}
