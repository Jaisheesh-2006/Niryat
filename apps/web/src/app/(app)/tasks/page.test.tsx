import { taskSchema } from "@niryat/shared";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskPlanForm } from "../../../components/TaskPlanForm";
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
      plannedDate: null,
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
      plannedDate: null,
      invoiceId: "10000000-0000-4000-8000-000000000002",
      sourceRuleId: "RBI_REALISATION",
      createdAt: "2026-10-28T12:00:00.000Z",
      doneAt: null,
    }),
  ]);
  const html = renderToStaticMarkup(await Tasks());
  expect(html).toContain("<td>30 Oct 2026</td>");
  expect(html).toContain('id="task-10000000-0000-4000-8000-000000000001"');
  expect(html).toContain("Planned work date");
  expect(html).toContain('class="mono">RBI_REALISATION</td>');
  expect(html).toContain('data-tone="neutral">Open</span>');
  expect(html).toContain('href="/invoices#invoice-10000000-0000-4000-8000-000000000002"');
  expect(html).toContain('data-variant="ghost"');
});

it("keeps the task plan form identity when refreshed dates are set or cleared", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  function formKey(node: ReactNode): string | null | undefined {
    let key: string | null | undefined;
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      const found = child.type === TaskPlanForm ? child.key : formKey(child.props.children);
      if (found !== undefined) key = found;
    });
    return key;
  }
  const keys = [];
  for (const plannedDate of [null, "2026-12-31", null]) {
    vi.mocked(apiGet).mockResolvedValue([
      taskSchema.parse({
        id,
        type: "agent_suggestion",
        status: "open",
        message: "Check records",
        dueDate: null,
        plannedDate,
        invoiceId: null,
        sourceRuleId: "TEST",
        createdAt: "2026-11-01T00:00:00Z",
        doneAt: null,
      }),
    ]);
    keys.push(formKey(await Tasks()));
  }
  expect(keys).toEqual([id, id, id]);
});
