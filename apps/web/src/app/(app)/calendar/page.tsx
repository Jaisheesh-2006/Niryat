import { calendarEventSchema } from "@niryat/shared";
import Link from "next/link";
import { ComplianceCalendar } from "../../../components/ComplianceCalendar";
import { PageHeader } from "../../../components/PageHeader";
import { Term } from "../../../components/Term";
import { apiGet } from "../../../lib/api";
import { deadlineList, planningResources } from "../../../lib/calendar";
import { formatDate } from "../../../lib/format";

export const metadata = { title: "Calendar" };

export default async function Calendar() {
  const events = (await apiGet("/calendar", calendarEventSchema.array())) ?? [];
  const deadlines = deadlineList(events, 10);
  return (
    <>
      <PageHeader
        title="Compliance calendar"
        description="See what is due, what to do next and which rule sets each deadline."
      />
      <details>
        <summary>What these deadlines mean</summary>
        <p>
          <Term term="lut" />
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
        <p>
          <Term term="realisation" />
        </p>
        <p>
          <Term term="credit_note" />
        </p>
      </details>
      <ul aria-label="Calendar legend" className="calendar-legend">
        <li className="badge niryat-overdue" data-tone="danger">
          Overdue
        </li>
        <li className="badge niryat-upcoming" data-tone="neutral">
          Upcoming
        </li>
        <li className="badge niryat-past" data-tone="neutral">
          Past
        </li>
      </ul>
      <div className="card calendar-card">
        <p>
          Drag your tasks to plan a work date. Legal deadlines stay locked. You can also set or
          clear planned dates on the <Link href="/tasks">Tasks page</Link>. Unplanned tasks appear
          on their due date, or today when there is no due date.
        </p>
        <ComplianceCalendar events={events} resources={planningResources} canPlan />
      </div>
      <section aria-labelledby="calendar-deadlines">
        <h2 id="calendar-deadlines">Overdue and next 10 upcoming deadlines</h2>
        {deadlines.length ? (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Deadline</th>
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
