import { calendarEventSchema } from "@niryat/shared";
import Link from "next/link";
import { ComplianceCalendar } from "../../components/ComplianceCalendar";
import { apiGet } from "../../lib/api";

export default async function Calendar() {
  const events = (await apiGet("/calendar", calendarEventSchema.array())) ?? [];
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const deadlines = [
    ...sorted.filter((event) => event.state === "overdue"),
    ...sorted.filter((event) => event.state === "upcoming").slice(0, 10),
  ];
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
