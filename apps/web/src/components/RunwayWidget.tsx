"use client";

import type { AgWidgetParams } from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";
import { useEffect, useState } from "react";
import {
  RUNWAY_WIDGET_TYPE,
  type RunwayBar,
  type RunwayWidgetState,
  runwayBars,
} from "../lib/runway";

function RunwayWidget(params: AgWidgetParams<RunwayWidgetState>) {
  const [bars, setBars] = useState<RunwayBar[]>();
  // Studio passes new params whenever the data, a filter or a cross-filter this widget read changes.
  useEffect(() => {
    const { dataMapping, widgetApi, context } = params;
    const [label] = dataMapping.label ?? [];
    const [days] = dataMapping.days ?? [];
    const [link] = dataMapping.link ?? [];
    if (!label || !days) {
      widgetApi.setDisplayState("incompleteDataMapping");
      return;
    }
    let live = true;
    widgetApi.setDisplayState("loading");
    widgetApi
      .getData(
        {
          fields: link ? [label, days, link] : [label, days],
          sort: [{ field: days, direction: "asc" }],
        },
        // No format to carry crossFilter, so ask for it here; it also makes clicks elsewhere refresh this widget.
        { crossFilter: "filter" },
      )
      .then(({ results }) => {
        if (!live) return;
        const next = runwayBars(
          results.rows,
          { label: label.key, days: days.key, link: link?.key },
          context?.invoiceLinks === true,
        );
        setBars(next);
        widgetApi.setDisplayState(next.length ? "displayed" : "noData");
      })
      .catch((error: unknown) => {
        console.error("RBI deadline runway: data request failed", error);
        if (live) widgetApi.setDisplayState("noData");
      });
    return () => {
      live = false;
    };
  }, [params]);

  return (
    <section className="runway" aria-labelledby={`${params.widgetId}-title`}>
      <h3 id={`${params.widgetId}-title`} className="runway-title">
        RBI deadline runway
      </h3>
      <ol className="runway-list">
        {bars?.map((bar, index) => {
          const status = bar.overdue
            ? `${-bar.days} ${bar.days === -1 ? "day" : "days"} overdue`
            : `${bar.days} ${bar.days === 1 ? "day" : "days"} left`;
          return (
            // Invoice numbers repeat across freelancers and rows hold no state, so position is the key.
            // biome-ignore lint/suspicious/noArrayIndexKey: see the line above.
            <li key={index} className="runway-row">
              {bar.href ? (
                <a className="runway-label mono" href={bar.href}>
                  {bar.label}
                </a>
              ) : (
                <span className="runway-label mono">{bar.label}</span>
              )}
              <span className="runway-track" aria-hidden="true">
                <span
                  className="runway-bar"
                  data-overdue={bar.overdue || undefined}
                  style={{ width: `${bar.width}%` }}
                />
              </span>
              <span className="runway-status" data-overdue={bar.overdue || undefined}>
                {status}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const runwayWidget: AgWidgetDefinition<typeof RUNWAY_WIDGET_TYPE, RunwayWidgetState> = {
  id: RUNWAY_WIDGET_TYPE,
  label: "RBI deadline runway",
  dataMapping: {
    label: {
      type: "field",
      supportedRoles: ["category"],
      required: true,
      aiDescription: "Invoice number shown on each bar.",
    },
    days: {
      type: "field",
      supportedRoles: ["numeric"],
      required: true,
      aiDescription:
        "The invoice's Days to RBI deadline field, computed by Niryat's rules. Negative means overdue.",
    },
    link: {
      type: "field",
      supportedRoles: ["category"],
      aiDescription: "Optional Invoice ID, so each bar opens that invoice.",
    },
  },
  // Only the widget type and data fields are editable; there is no format to edit.
  form: ({ createWidgetSection, createDataMapping }) => {
    // shortcut: AG Studio 3.0.0 types this key as a form path, but its runtime reads the bare
    // data-mapping key and prefixes "dataMapping." itself; drop the cast when the typing is fixed.
    const items = [
      { key: "label", label: "Invoice" },
      { key: "days", label: "Days to RBI deadline" },
      { key: "link", label: "Invoice ID (link)" },
    ] as unknown as Parameters<typeof createDataMapping>[0];
    const fields = createDataMapping(items);
    return fields ? [createWidgetSection(), fields] : [createWidgetSection()];
  },
  comp: RunwayWidget,
  defaultSize: { width: 400, height: 300 },
  minSize: { width: 240, height: 160 },
  ai: {
    label: "RBI deadline runway",
    description:
      "Niryat's RBI deadline runway: one bar per unpaid export invoice showing the days left until its RBI payment deadline. Overdue invoices are full red bars.",
    usage:
      "Use to show one freelancer's unpaid invoices against their RBI deadlines. Not for a portfolio of several freelancers (invoice numbers repeat across them), paid invoices, money totals or other dates.",
    configuration:
      "Map label to the invoice number, days to Days to RBI deadline and, when available, link to Invoice ID, all from the same invoices source. Add a widget filter so only invoices whose Unpaid amount is above zero are shown.",
  },
};
