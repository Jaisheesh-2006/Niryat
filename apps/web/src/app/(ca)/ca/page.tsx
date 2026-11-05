import { caPortfolioSchema } from "@niryat/shared";
import Link from "next/link";
import { EmptyState } from "../../../components/EmptyState";
import { Users } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { apiGet } from "../../../lib/api";
import { formatDate } from "../../../lib/format";

export const metadata = { title: "CA clients" };

export default async function CaClients() {
  const portfolio = await apiGet("/ca/portfolio", caPortfolioSchema, "/ca/login");
  if (portfolio === null) throw new Error("CA portfolio unavailable");
  return (
    <>
      <PageHeader title="Clients" description="View records shared by your freelancer clients." />
      {portfolio.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet">
          <a href="/ca/requests">Accept a request</a> from a freelancer client to see their records
          here.
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table>
            <caption className="visually-hidden">
              Clients, most overdue invoices first, then nearest deadline
            </caption>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Health score</th>
                <th scope="col">Unpaid invoices</th>
                <th scope="col">Overdue invoices</th>
                <th scope="col">Next deadline</th>
                <th scope="col">Missing FIRA</th>
                <th scope="col">Approvals waiting</th>
                <th scope="col">Shared since</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((row) => (
                <tr key={row.linkId}>
                  <th scope="row">
                    <Link href={`/ca/clients/${row.freelancerId}`}>{row.name ?? row.email}</Link>
                  </th>
                  <td className="num">{row.healthScore ?? "Profile not complete"}</td>
                  <td className="num">{row.unpaidCount}</td>
                  <td className="num">{row.overdueCount}</td>
                  <td>
                    {row.nextDeadline ? (
                      <>
                        <time dateTime={row.nextDeadline.date}>
                          {formatDate(row.nextDeadline.date)}
                        </time>
                        : {row.nextDeadline.title}
                      </>
                    ) : (
                      "None"
                    )}
                  </td>
                  <td className="num">{row.firaMissingCount}</td>
                  <td className="num">{row.pendingApprovals}</td>
                  <td>
                    <time dateTime={row.sharedSince}>{formatDate(row.sharedSince)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
