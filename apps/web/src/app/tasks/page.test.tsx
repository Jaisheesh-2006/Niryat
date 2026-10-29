import { taskSchema } from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiGet } from "../../lib/api";
import Tasks from "./page";

vi.mock("../../lib/api", () => ({ apiGet: vi.fn() }));

beforeEach(() => vi.stubEnv("TZ", "UTC"));
afterEach(() => vi.unstubAllEnvs());

it.each([
  { doneAt: "2026-10-29T18:29:59.000Z", expected: "2026-10-29" },
  { doneAt: "2026-10-29T18:30:00.000Z", expected: "2026-10-30" },
  { doneAt: "2026-10-29T19:30:00.000Z", expected: "2026-10-30" },
  { doneAt: "2026-12-31T18:30:00.000Z", expected: "2027-01-01" },
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
