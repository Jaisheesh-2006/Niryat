import { taskSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiGet } from "../../../lib/api";
import Tasks from "./page";

vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => vi.stubEnv("TZ", "UTC"));
afterEach(() => vi.unstubAllEnvs());

it.each([
  { doneAt: "2026-10-29T18:29:59.000Z", expected: "29 Oct 2026" },
  { doneAt: "2026-10-29T18:30:00.000Z", expected: "30 Oct 2026" },
  { doneAt: "2026-10-29T19:30:00.000Z", expected: "30 Oct 2026" },
  { doneAt: "2026-12-31T18:30:00.000Z", expected: "1 Jan 2027" },
  { doneAt: null, expected: "" },
])("renders completion $doneAt on its India date", async ({ doneAt, expected }) => {
  vi.mocked(apiGet).mockResolvedValue([
    taskSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      type: "refund_recorded",
      status: "done",
      message: "Refund recorded",
      dueDate: null,
      invoiceId: null,
      sourceRuleId: "CREDIT_NOTE",
      createdAt: "2026-10-28T12:00:00.000Z",
      doneAt,
    }),
  ]);

  const html = renderToStaticMarkup(await Tasks());
  expect(html).toContain(`Refund recorded (done ${expected})`);
});

it("shows open tasks as neutral rows with source and invoice actions", async () => {
  vi.mocked(apiGet).mockResolvedValue([
    taskSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      type: "rbi_deadline_passed",
      status: "open",
      message: "Check the payment.",
      dueDate: "2026-10-30",
      invoiceId: "10000000-0000-4000-8000-000000000002",
      sourceRuleId: "RBI_REALISATION",
      createdAt: "2026-10-28T12:00:00.000Z",
      doneAt: null,
    }),
  ]);
  const html = renderToStaticMarkup(await Tasks());
  expect(html).toContain("<td>30 Oct 2026</td>");
  expect(html).toContain('class="mono">RBI_REALISATION</td>');
  expect(html).toContain('data-tone="neutral">Open</span>');
  expect(html).toContain('href="/invoices#invoice-10000000-0000-4000-8000-000000000002"');
  expect(html).toContain('data-variant="ghost"');
});
