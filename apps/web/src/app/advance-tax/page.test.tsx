import { invoiceCurrencies } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdvanceTax from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=test" }) }));
vi.mock("../../lib/env", () => ({ apiUrl: "http://localhost:3001" }));

const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  fetcher.mockReset().mockResolvedValue(
    Response.json({
      taxYear: "2026-27",
      receipts: [{ currency: "USD", payments: "100.00", refunds: "0.00", net: "100.00" }],
      grossReceiptsInr: null,
      eligibility: {
        state: "uncertain",
        reason: "profession_unknown",
        message:
          "Answer the specified-profession question on your profile to check presumptive taxation.",
        citation: { ruleId: "PRESUMPTIVE_TAX", source: "Fixture source", effectiveFrom: null },
      },
      deemedIncomeInr: null,
      estimatedTaxInr: null,
      notPayable: false,
      schedule: [],
      messages: [],
      citations: [],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

it.each(invoiceCurrencies)(
  "rejects a second currency embedded in the %s rate field",
  async (currency) => {
    const other = currency === "USD" ? "EUR" : "USD";
    const html = renderToStaticMarkup(
      await AdvanceTax({
        searchParams: Promise.resolve({
          taxYear: "2026-27",
          [currency]: `84.10,${other}:90.5`,
          [other]: "",
        }),
      }),
    );
    expect(html).toContain(
      "Enter a valid tax year, positive INR rates and a whole-rupee tax estimate.",
    );
    expect(html).toContain("Reset estimate");
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each(["0", "84.12345", "84:90"])(
  "rejects invalid individual rate %s before calling the API",
  async (USD) => {
    await AdvanceTax({ searchParams: Promise.resolve({ USD }) });
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each([
  { fields: { USD: "84.10", EUR: "90.5" }, rates: "USD:84.10,EUR:90.5" },
  { fields: { USD: "84.10", EUR: "" }, rates: "USD:84.10" },
  { fields: { USD: "", EUR: "" }, rates: null },
  { fields: {}, rates: null },
])("preserves valid and omitted rates: $rates", async ({ fields, rates }) => {
  const html = renderToStaticMarkup(await AdvanceTax({ searchParams: Promise.resolve(fields) }));
  expect(html).toContain('method="get"');
  const query = new URLSearchParams();
  if (rates !== null) query.set("rates", rates);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    new URL(`/advance-tax?${query}`, "http://localhost:3001"),
    {
      headers: { cookie: "session=test" },
      cache: "no-store",
    },
  );
});
