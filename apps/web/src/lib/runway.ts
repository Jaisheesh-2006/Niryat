import type {
  AgDefaultRegistry,
  AgDefaultWidgetDefinition,
  AgWidgetData,
  AgWidgetDataFormat,
  AgWidgetFieldReference,
} from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";

export const RUNWAY_WIDGET_TYPE = "rbi-runway";

// No format: AG Studio 3.0.0 exports no shape builder for a custom format, so the widget titles itself.
export interface RunwayWidgetState
  extends AgWidgetData<
    {
      label: AgWidgetFieldReference[];
      days: AgWidgetFieldReference[];
      link?: AgWidgetFieldReference[];
    },
    AgWidgetDataFormat<never>
  > {
  type: typeof RUNWAY_WIDGET_TYPE;
}

export interface NiryatRegistry extends Omit<AgDefaultRegistry, "widgets"> {
  widgets: readonly (
    | AgDefaultWidgetDefinition
    | AgWidgetDefinition<typeof RUNWAY_WIDGET_TYPE, RunwayWidgetState>
  )[];
}

export type RunwayBar = {
  label: string;
  days: number;
  overdue: boolean;
  /** Bar length as a percentage of the longest remaining runway; overdue bars are full. */
  width: number;
  href?: string;
};

// Days and overdue come from packages/rules (daysRemaining < 0 is its overdue test); this only draws them.
export function runwayBars(
  rows: readonly Record<string, unknown>[],
  keys: { label: string; days: string; link?: string | undefined },
  invoiceLinks: boolean,
): RunwayBar[] {
  const items = rows.flatMap((row) => {
    const days = row[keys.days];
    const label = row[keys.label];
    if (typeof days !== "number" || !Number.isFinite(days) || label == null) return [];
    const link = keys.link === undefined ? undefined : row[keys.link];
    return [
      {
        label: String(label),
        days,
        ...(invoiceLinks && typeof link === "string" && link
          ? { href: `/invoices#invoice-${encodeURIComponent(link)}` }
          : {}),
      },
    ];
  });
  const longest = Math.max(1, ...items.map((item) => item.days));
  return items
    .sort((a, b) => a.days - b.days)
    .map((item) => ({
      ...item,
      overdue: item.days < 0,
      width: item.days < 0 ? 100 : Math.max(2, Math.round((item.days / longest) * 100)),
    }));
}
