import { caCalendarSchema } from "@niryat/shared";
import Link from "next/link";
import { CaCalendarView } from "../../../../components/CaCalendarView";
import { PageHeader } from "../../../../components/PageHeader";
import { apiGet } from "../../../../lib/api";
import { deadlineList } from "../../../../lib/calendar";
import { formatDate } from "../../../../lib/format";

export const metadata = { title: "Client calendar" };

export default async function CaCalendar() {
  const calendar = (await apiGet("/ca/calendar", caCalendarSchema, "/ca/login")) ?? {
    clients: [],
    events: [],
  };
  const names = new Map(calendar.clients.map((client) => [client.id, client.name]));
  const deadlines = deadlineList(calendar.events, 10);
  return (
    <>
      <PageHeader title="Client compliance calendar" />
      <p>Deadlines for clients who have accepted sharing with you. View only.</p>
      {calendar.clients.length ? (
        <CaCalendarView {...calendar} />
      ) : (
        <p>No clients are sharing records with you yet.</p>
      )}
      <section aria-labelledby="ca-calendar-deadlines">
        <h2 id="ca-calendar-deadlines">Overdue and next 10 upcoming deadlines</h2>
        {deadlines.length ? (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Client</th>
                  <th scope="col">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <time dateTime={event.date}>{formatDate(event.date)}</time>
                    </td>
                    <td>{names.get(event.freelancerId)}</td>
                    <td>
                      <Link href={event.href}>{event.title}</Link>
                      <p>{event.action}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No overdue or upcoming deadlines.</p>
        )}
      </section>
    </>
  );
}
