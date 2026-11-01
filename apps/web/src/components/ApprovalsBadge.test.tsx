import {
  type ActionStatus,
  actionStatusSchema,
  closePageSchema,
  type ReminderAction,
} from "@niryat/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { apiGet } from "../lib/api";
import { ApprovalsBadge } from "./ApprovalsBadge";

vi.mock("../lib/api", () => ({ apiGet: vi.fn() }));

afterEach(() => vi.resetAllMocks());

function action(status: ActionStatus): ReminderAction {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    invoiceId: "40000000-0000-4000-8000-000000000002",
    invoiceNumber: "INV-0001",
    paymentId: null,
    paypalAction: "send_invoice_reminder",
    status,
    payload: { stage: 30 },
    error: null,
    createdAt: "2026-11-01T00:00:00Z",
  };
}

it("renders nothing when there are no approvals", async () => {
  vi.mocked(apiGet).mockResolvedValue({ runs: [], approvals: [] });
  expect(await ApprovalsBadge()).toBeNull();
  expect(apiGet).toHaveBeenCalledWith("/close", closePageSchema);
});

it("renders nothing for a missing close response", async () => {
  vi.mocked(apiGet).mockResolvedValue(null);
  expect(await ApprovalsBadge()).toBeNull();
});

it.each([
  [1, "1 approval waiting"],
  [2, "2 approvals waiting"],
])("renders %i with an accessible label", async (count, label) => {
  vi.mocked(apiGet).mockResolvedValue({
    runs: [],
    approvals: Array.from({ length: count }, () => action("proposed")),
  });
  const html = renderToStaticMarkup(await ApprovalsBadge());
  expect(html).toContain(`<span aria-hidden="true">${count}</span>`);
  expect(html).toContain(`<span class="visually-hidden">${label}</span>`);
});

it("counts only proposed statuses", async () => {
  vi.mocked(apiGet).mockResolvedValue({
    runs: [],
    approvals: actionStatusSchema.options.map(action),
  });
  const html = renderToStaticMarkup(await ApprovalsBadge());
  expect(html).toContain("1 approval waiting");
  expect(html).toContain('<span aria-hidden="true">1</span>');
});
