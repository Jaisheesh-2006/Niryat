import { calendarEventSchema } from "@niryat/shared";
import Link from "next/link";
import { ComplianceCalendar } from "../../../components/ComplianceCalendar";
import { apiGet } from "../../../lib/api";
import { deadlineList } from "../../../lib/calendar";

export default async function Calendar() {
  const events = (await apiGet("/calendar", calendarEventSchema.array())) ?? [];
  const deadlines = deadlineList(events, 10);
  return (
    <>
      <h1>Compliance calendar</h1>
      <ul aria-label="Calendar legend" className="calendar-legend">
        <li className="niryat-overdue">Overdue</li>
        <li className="niryat-upcoming">Upcoming</li>
        <li className="niryat-past">Past</li>
      </ul>
      <ComplianceCalendar events={events} />
      <section aria-labelledby="calendar-deadlines">
        <h2 id="calendar-deadlines">Overdue and next 10 upcoming deadlines</h2>
        {deadlines.length ? (
          <ul>
            {deadlines.map((event) => (
              <li key={event.id}>
                <time dateTime={event.date}>{event.date}</time>{" "}
                <Link href={event.href}>{event.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No overdue or upcoming deadlines.</p>
        )}
      </section>
    </>
  );
}
