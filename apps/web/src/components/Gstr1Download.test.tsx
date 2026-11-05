import { gstr1PreviewSchema } from "@niryat/shared";
import type { FormEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Gstr1Download } from "./Gstr1Download";

// No DOM in these tests: freeze state and call the submit handler directly.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, () => {}],
}));
afterEach(() => vi.unstubAllGlobals());

const invoiceId = "10000000-0000-4000-8000-000000000001";
const preview = gstr1PreviewSchema.parse({
  period: "2026-10",
  frequency: "monthly",
  label: "October 2026",
  start: "2026-10-01",
  end: "2026-10-31",
  dueDate: "2026-11-11",
  periods: ["10", "09", "08", "07", "06", "05", "04", "03"].map((month) => ({
    period: `2026-${month}`,
    label: month,
  })),
  invoices: [
    {
      invoiceId,
      number: "2026-27/0001",
      date: "2026-10-15",
      currency: "USD",
      amount: "100.00",
      status: "sent",
      lutCovered: true,
    },
  ],
  refunds: [],
  totals: [{ currency: "USD", invoices: "100.00", refunds: "0.00", net: "100.00" }],
  citation: { ruleId: "GSTR1_6A", source: "Source citation", effectiveFrom: null },
});

it.each([
  [undefined, "/api/gstr1/file"],
  [
    "20000000-0000-4000-8000-000000000001",
    "/api/gstr1/file?client=20000000-0000-4000-8000-000000000001",
  ],
])("posts the rates for client %s to %s", async (client, url) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ error: "empty_period" }, { status: 409 }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "FormData",
    class {
      get = (name: string) => (name.startsWith("inr-") ? "84.1234" : "18");
    },
  );
  const form = Gstr1Download({ preview, client });
  const event = { preventDefault: () => {}, currentTarget: {} };
  await form.props.onSubmit(event as unknown as FormEvent<HTMLFormElement>);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(url, expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    period: "2026-10",
    rates: { [invoiceId]: { inrRate: "84.1234", gstRate: "18" } },
  });
});
