import { describe, expect, it } from "vitest";
import { runwayWidget } from "../components/RunwayWidget";
import { dashboardInitialState } from "./dashboard";
import { RUNWAY_WIDGET_TYPE, runwayBars } from "./runway";

const keys = {
  label: "invoices.number",
  days: "invoices.daysRemaining",
  link: "invoices.invoiceId",
};
const row = (number: string, days: unknown, invoiceId: unknown = `id-${number}`) => ({
  "invoices.number": number,
  "invoices.daysRemaining": days,
  "invoices.invoiceId": invoiceId,
});

describe("RBI deadline runway", () => {
  it("orders bars by days left, scales them to the longest runway and fills overdue bars", () => {
    expect(
      runwayBars([row("B", 120), row("A", -3), row("C", 30), row("D", 0)], keys, false),
    ).toEqual([
      { label: "A", days: -3, overdue: true, width: 100 },
      { label: "D", days: 0, overdue: false, width: 2 },
      { label: "C", days: 30, overdue: false, width: 25 },
      { label: "B", days: 120, overdue: false, width: 100 },
    ]);
  });

  it("links to the freelancer's invoice only when allowed, with an encoded id", () => {
    expect(runwayBars([row("A", 5, "a b")], keys, true)).toMatchObject([
      { href: "/invoices#invoice-a%20b" },
    ]);
    expect(runwayBars([row("A", 5)], keys, false)[0]).not.toHaveProperty("href");
    expect(runwayBars([row("A", 5, null)], keys, true)[0]).not.toHaveProperty("href");
    expect(runwayBars([row("A", 5)], { ...keys, link: undefined }, true)[0]).not.toHaveProperty(
      "href",
    );
  });

  it("skips rows without a numeric deadline or a label", () => {
    expect(runwayBars([row("A", null), row("B", "12"), row("C", Number.NaN)], keys, true)).toEqual(
      [],
    );
    expect(runwayBars([{ "invoices.daysRemaining": 3 }], keys, true)).toEqual([]);
  });

  it("is registered for AI use, and the default layout maps every required field", () => {
    expect(runwayWidget.id).toBe(RUNWAY_WIDGET_TYPE);
    expect(runwayWidget.ai?.description).toMatch(/RBI deadline/);
    const [page] = dashboardInitialState.pages ?? [];
    const widget = page?.widgets?.runway;
    expect(widget?.type).toBe(RUNWAY_WIDGET_TYPE);
    const mapped = Object.keys(widget?.dataMapping ?? {});
    const defined = Object.entries(runwayWidget.dataMapping ?? {});
    expect(mapped.every((key) => defined.some(([id]) => id === key))).toBe(true);
    for (const [key, slot] of defined) if (slot.required) expect(mapped).toContain(key);
    expect(page?.filter?.widget?.runway).toEqual(page?.filter?.widget?.unpaid);
  });
});
