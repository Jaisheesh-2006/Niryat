import {
  calendarEventSchema,
  closePageSchema,
  healthReportSchema,
  invoiceViewSchema,
  taskSchema,
} from "@niryat/shared";
import Link from "next/link";
import { Suspense } from "react";
import { CardBoundary } from "../../../components/CardBoundary";
import { OverviewApprovals } from "../../../components/OverviewApprovals";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { apiGet } from "../../../lib/api";
import { deadlineList } from "../../../lib/calendar";
import { formatDate, formatMoney } from "../../../lib/format";
import { invoiceStatus } from "../../../lib/status";

export const metadata = { title: "Today" };

async function ApprovalsTile() {
  const close = await apiGet("/close", closePageSchema);
  const count = close?.approvals.filter((action) => action.status === "proposed").length ?? 0;
  return (
    <Link href="/close" className="stat-tile" data-tone={count > 0 ? "attention" : "neutral"}>
      <h2>Approvals waiting</h2>
      <p className="stat-value">{count}</p>
      <p>Review in Monthly close</p>
    </Link>
  );
}

async function DeadlineTile() {
  const events = (await apiGet("/calendar", calendarEventSchema.array())) ?? [];
  const next = deadlineList(events, 1)[0];
  const overdue = events.filter((event) => event.state === "overdue").length;
  return (
    <Link href="/calendar" className="stat-tile">
      <h2>Next deadline</h2>
      <p className="stat-value">{next ? formatDate(next.date) : "None scheduled"}</p>
      {next && <p>{next.title}</p>}
      {overdue > 0 && <StatusBadge tone="danger">{overdue} overdue</StatusBadge>}
    </Link>
  );
}

async function HealthTile() {
  const report = await apiGet("/health-check", healthReportSchema);
  const high = report?.flags.filter((flag) => flag.severity === "high").length ?? 0;
  const tone = !report
    ? "neutral"
    : high > 0
      ? "danger"
      : report.flags.some((flag) => flag.severity === "medium")
        ? "attention"
        : "success";
  return (
    <Link href={report ? "/health-check" : "/profile"} className="stat-tile" data-tone={tone}>
      <h2>Health score</h2>
      <p className="stat-value">{report ? `${report.score} / 100` : "—"}</p>
      <p>
        {!report
          ? "Complete your profile"
          : high > 0
            ? `${high} high-priority flags`
            : "No high-priority flags"}
      </p>
    </Link>
  );
}

async function TasksTile() {
  const tasks = (await apiGet("/tasks", taskSchema.array())) ?? [];
  return (
    <Link href="/tasks" className="stat-tile">
      <h2>Open tasks</h2>
      <p className="stat-value">{tasks.filter((task) => task.status === "open").length}</p>
      <p>View tasks</p>
    </Link>
  );
}

async function Approvals() {
  const close = await apiGet("/close", closePageSchema);
  return (
    <section className="card" aria-labelledby="overview-approvals">
      <div className="card-header">
        <h2 id="overview-approvals">Waiting for your approval</h2>
        <Link href="/close">All approvals</Link>
      </div>
      <OverviewApprovals approvals={close?.approvals ?? []} />
    </section>
  );
}

async function Deadlines() {
  const events = (await apiGet("/calendar", calendarEventSchema.array())) ?? [];
  const deadlines = deadlineList(events, 5);
  return (
    <section className="card" aria-labelledby="overview-deadlines">
      <h2 id="overview-deadlines">Upcoming deadlines</h2>
      {deadlines.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Deadline</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.map((event) => (
                <tr key={event.id}>
                  <td>
                    <time dateTime={event.date}>{formatDate(event.date)}</time>
                  </td>
                  <td>
                    <Link href={event.href}>{event.title}</Link>
                  </td>
                  <td>
                    <StatusBadge tone={event.state === "overdue" ? "danger" : "success"}>
                      {event.state === "overdue" ? "Overdue" : "Upcoming"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>None scheduled</p>
      )}
    </section>
  );
}

async function RecentInvoices() {
  const invoices = (await apiGet("/invoices", invoiceViewSchema.array())) ?? [];
  return (
    <section className="card" aria-labelledby="overview-invoices">
      <div className="card-header">
        <h2 id="overview-invoices">Recent invoices</h2>
        <Link href="/invoices">All invoices</Link>
      </div>
      {invoices.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Date</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 5).map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link className="mono" href={`/invoices#invoice-${invoice.id}`}>
                      {invoice.number}
                    </Link>
                  </td>
                  <td>{invoice.clientName}</td>
                  <td>
                    <time dateTime={invoice.date}>{formatDate(invoice.date)}</time>
                  </td>
                  <td className="num">{formatMoney(invoice.amount, invoice.currency)}</td>
                  <td>
                    <StatusBadge tone={invoiceStatus[invoice.status].tone}>
                      {invoiceStatus[invoice.status].label}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No invoices yet</p>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="card skeleton" aria-busy="true">
      <span className="visually-hidden">Loading</span>
    </div>
  );
}

export default function Overview() {
  return (
    <>
      <PageHeader
        title="Today"
        description={
          <>
            Your next actions and recent PayPal activity for {formatDate(new Date().toISOString())}.
          </>
        }
      />
      <div className="stat-grid">
        <CardBoundary title="Approvals waiting">
          <Suspense fallback={<Skeleton />}>
            <ApprovalsTile />
          </Suspense>
        </CardBoundary>
        <CardBoundary title="Next deadline">
          <Suspense fallback={<Skeleton />}>
            <DeadlineTile />
          </Suspense>
        </CardBoundary>
        <CardBoundary title="Health score">
          <Suspense fallback={<Skeleton />}>
            <HealthTile />
          </Suspense>
        </CardBoundary>
        <CardBoundary title="Open tasks">
          <Suspense fallback={<Skeleton />}>
            <TasksTile />
          </Suspense>
        </CardBoundary>
      </div>
      <div className="overview-grid">
        <CardBoundary title="Waiting for your approval">
          <Suspense fallback={<Skeleton />}>
            <Approvals />
          </Suspense>
        </CardBoundary>
        <CardBoundary title="Upcoming deadlines">
          <Suspense fallback={<Skeleton />}>
            <Deadlines />
          </Suspense>
        </CardBoundary>
        <CardBoundary title="Recent invoices">
          <Suspense fallback={<Skeleton />}>
            <RecentInvoices />
          </Suspense>
        </CardBoundary>
      </div>
    </>
  );
}
