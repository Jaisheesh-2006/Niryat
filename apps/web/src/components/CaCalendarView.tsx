"use client";

import type { CaCalendar } from "@niryat/shared";
import { useMemo, useState } from "react";
import { caCalendarResources, calendarResourceId, calendarResources } from "../lib/calendar";
import { ComplianceCalendar } from "./ComplianceCalendar";

export function CaCalendarView({ clients, events }: CaCalendar) {
  const [categories, setCategories] = useState(calendarResources.map((resource) => resource.id));
  const resources = useMemo(() => caCalendarResources(clients), [clients]);
  const names = new Map(clients.map((client) => [client.id, client.name]));
  const visible = events
    .filter((event) => categories.includes(calendarResourceId(event.kind)))
    .map((event) => ({ ...event, title: `${names.get(event.freelancerId)}: ${event.title}` }));
  return (
    <>
      <fieldset>
        <legend>Deadline categories</legend>
        {calendarResources.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              checked={categories.includes(category.id)}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setCategories((current) =>
                  checked ? [...current, category.id] : current.filter((id) => id !== category.id),
                );
              }}
            />
            {category.name}
          </label>
        ))}
      </fieldset>
      <p>
        Choose clients in the calendar sidebar. The deadline list below shows all clients and
        categories.
      </p>
      <div className="card calendar-card">
        <ComplianceCalendar events={visible} resources={resources} />
      </div>
    </>
  );
}
