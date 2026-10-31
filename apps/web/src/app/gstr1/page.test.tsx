import { type Gstr1Preview, gstr1PreviewSchema } from "@niryat/shared";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Gstr1Download } from "../../components/Gstr1Download";
import Gstr1 from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=test" }) }));
vi.mock("../../lib/env", () => ({ apiUrl: "http://localhost:3001" }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const id = "10000000-0000-4000-8000-000000000001";
const preview: Gstr1Preview = gstr1PreviewSchema.parse({
  period: "2026-10",
  frequency: "monthly",
  label: "October 2026",
  start: "2026-10-01",
  end: "2026-10-31",
  dueDate: "2026-11-11",
  periods: [
    "2026-10",
    "2026-09",
    "2026-08",
    "2026-07",
    "2026-06",
    "2026-05",
    "2026-04",
    "2026-03",
  ].map((period) => ({ period, label: period === "2026-10" ? "October 2026" : period })),
  invoices: [
    {
      invoiceId: id,
      number: "2026-27/0001",
      date: "2026-10-15",
      currency: "USD",
      amount: "100.00",
      status: "issued",
      lutCovered: true,
    },
  ],
  refunds: [],
  totals: [{ currency: "USD", invoices: "100.00", refunds: "0.00", net: "100.00" }],
  citation: { ruleId: "GSTR1_6A", source: "Source citation", effectiveFrom: null },
});
const fetcher = vi.fn<typeof fetch>();

beforeEach(() => {
  fetcher.mockReset().mockResolvedValue(Response.json(preview));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("renders the server preview and eight API-supplied periods without recomputing dates", async () => {
  const html = renderToStaticMarkup(await Gstr1({ searchParams: Promise.resolve({}) }));
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(new URL("http://localhost:3001/gstr1"), {
    headers: { cookie: "session=test" },
    cache: "no-store",
  });
  expect(html).toContain('method="get"');
  expect(html.match(/<option /g)).toHaveLength(8);
  expect(html).toContain('value="2026-10" selected=""');
  expect(html).toContain(
    "Due 2026-11-11. The government sometimes extends this date; check the GST portal.",
  );
  expect(html).toContain("Rule GSTR1_6A: Source citation. Verify with your CA.");
  expect(html).toContain(
    "Refunds are not in this file. Declare credit notes for them in GSTR-1 Table 9B with your CA.",
  );
});

it.each([
  {
    period: "2026-10",
    label: "October 2026",
    start: "2026-10-01",
    end: "2026-10-31",
    dueDate: "2026-11-11",
  },
  {
    period: "2026-01",
    label: "January 2026",
    start: "2026-01-01",
    end: "2026-01-31",
    dueDate: "2026-02-11",
  },
])("keeps requested period $period selected outside the recent choices", async (selected) => {
  const periods = [...preview.periods.slice(1), { period: "2026-02", label: "February 2026" }];
  fetcher.mockResolvedValue(
    Response.json({
      ...preview,
      ...selected,
      periods,
      invoices: [],
      refunds: [],
      totals: [],
    }),
  );
  const html = renderToStaticMarkup(
    await Gstr1({ searchParams: Promise.resolve({ period: selected.period }) }),
  );
  expect(html).toContain(
    `<option value="${selected.period}" selected="">${selected.label}</option>`,
  );
  expect(html).toContain(`<h2>${selected.label}</h2>`);
  expect(html.match(/<option /g)).toHaveLength(9);
  for (const period of periods) expect(html).toContain(`value="${period.period}"`);
});

it("changes selector identity when navigation changes the report period", async () => {
  const keys: (string | null)[] = [];
  const periods = [...preview.periods.slice(1), { period: "2026-02", label: "February 2026" }];
  for (const selected of [
    {
      period: "2026-08",
      label: "August 2026",
      start: "2026-08-01",
      end: "2026-08-31",
      dueDate: "2026-09-11",
    },
    {
      period: "2026-09",
      label: "September 2026",
      start: "2026-09-01",
      end: "2026-09-30",
      dueDate: "2026-10-11",
    },
  ]) {
    fetcher.mockResolvedValue(
      Response.json({
        ...preview,
        ...selected,
        periods,
        invoices: [],
        refunds: [],
        totals: [],
      }),
    );
    const page = await Gstr1({
      searchParams: Promise.resolve(
        selected.period === "2026-08" ? { period: selected.period } : {},
      ),
    });
    const form = Children.toArray(page.props.children).find(
      (child) => isValidElement(child) && child.type === "form",
    );
    if (!isValidElement<{ children: ReactNode }>(form)) throw new Error("Expected period form");
    const select = Children.toArray(form.props.children).find(
      (child) => isValidElement(child) && child.type === "select",
    );
    if (!isValidElement<{ defaultValue: string }>(select))
      throw new Error("Expected period selector");
    expect(select.props.defaultValue).toBe(selected.period);
    keys.push(select.key);
  }
  expect(keys[1]).not.toBe(keys[0]);
});

it("forwards the selected period and renders exclusions without requesting their rates", async () => {
  const excluded = {
    ...preview.invoices[0],
    invoiceId: "10000000-0000-4000-8000-000000000002",
    number: "2026-27/0002",
    date: "2026-10-01",
    lutCovered: false,
  };
  fetcher.mockResolvedValue(
    Response.json({ ...preview, invoices: [...preview.invoices, excluded] }),
  );
  const html = renderToStaticMarkup(
    await Gstr1({ searchParams: Promise.resolve({ period: "2026-10" }) }),
  );
  expect(fetcher.mock.calls[0]?.[0]).toEqual(new URL("http://localhost:3001/gstr1?period=2026-10"));
  expect(html).toContain(
    "Invoice 2026-27/0002 is not covered by your LUT on 2026-10-01, so it needs IGST. It is not in this file; ask your CA.",
  );
  expect(html).not.toContain(`name="gst-${excluded.invoiceId}"`);
});

it("labels both rate inputs, connects their help, and supplies no GST default", () => {
  const html = renderToStaticMarkup(<Gstr1Download preview={preview} />);
  expect(html).toContain("INR rate for invoice 2026-27/0001");
  expect(html).toContain("Use the exchange rate your CA uses for the invoice date.");
  expect(html).toContain("Applicable IGST rate (%) for invoice 2026-27/0001");
  expect(html).toContain(
    "Enter the rate your CA confirms for this service and invoice date. This is not the INR exchange rate. Under LUT, no IGST is payable in this file.",
  );
  const inputs = html.match(/<input[^>]*>/g) ?? [];
  expect(inputs).toHaveLength(2);
  for (const input of inputs) {
    expect(input).toContain("required");
    expect(input).toContain("aria-describedby=");
    expect(input).not.toContain("value=");
  }
  expect(html).toContain("Download GSTR-1 Table 6A file");
});

it.each([
  [
    403,
    "not_gst_registered",
    "GSTR-1 data is only for GST-registered users. If you have registered, update your profile.",
  ],
  [
    409,
    "gstr1_frequency_missing",
    "Choose how you file GSTR-1 (monthly or quarterly) on your profile first.",
  ],
  [400, "invalid_period", "Choose a valid reporting period for your filing frequency."],
] as const)("renders the expected message for HTTP %s", async (status, error, message) => {
  fetcher.mockResolvedValue(Response.json({ error }, { status }));
  const html = renderToStaticMarkup(await Gstr1({ searchParams: Promise.resolve({}) }));
  expect(html).toContain(message);
  expect(html).not.toContain("Download GSTR-1 Table 6A file");
  expect(html).not.toContain("Reconciliation");
});

it.each([
  [401, "/login"],
  [404, "/profile"],
] as const)("redirects HTTP %s", async (status, path) => {
  fetcher.mockResolvedValue(Response.json({ error: "error" }, { status }));
  await expect(Gstr1({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:${path}`);
});

it("renders an empty period and disables download", async () => {
  fetcher.mockResolvedValue(Response.json({ ...preview, invoices: [], totals: [] }));
  const html = renderToStaticMarkup(await Gstr1({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("No export invoices are dated in this period.");
  expect(html).toContain(
    '<button type="submit" disabled="">Download GSTR-1 Table 6A file</button>',
  );
});

it("rejects duplicate query periods before fetching", async () => {
  const html = renderToStaticMarkup(
    await Gstr1({ searchParams: Promise.resolve({ period: ["2026-10", "2026-09"] }) }),
  );
  expect(html).toContain("Choose a valid reporting period");
  expect(fetcher).not.toHaveBeenCalled();
});
