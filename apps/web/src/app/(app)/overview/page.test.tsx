import type { ActionStatus, CalendarEvent, ReminderAction } from "@niryat/shared";
import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthForm } from "../../../components/AuthForm";
import { apiGet } from "../../../lib/api";
import { sendJson } from "../../../lib/forms";
import Overview, { metadata } from "./page";

const { setState } = vi.hoisted(() => ({ setState: vi.fn() }));
vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("../../../lib/forms", () => ({ sendJson: vi.fn(async () => ({ ok: true })) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, setState],
  useEffect: () => {},
}));
vi.mock("../../../components/CardBoundary", () => ({
  CardBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../../components/ActionButtons", () => ({ ActionButtons: () => null }));

const responses = new Map<string, unknown>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T18:30:00Z"));
  responses.clear();
  responses.set("/close", { runs: [], approvals: [] });
  responses.set("/calendar", []);
  responses.set("/health-check", null);
  responses.set("/tasks", []);
  responses.set("/invoices", []);
  vi.mocked(apiGet).mockImplementation(async (path, schema) => {
    expect(responses.has(path)).toBe(true);
    const response = responses.get(path);
    return response === null ? null : schema.parse(response);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// Resolve the page's async server components; keep ordinary React components for the renderer.
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(Children.toArray(node).map(resolve));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  function isAsyncComponent(value: unknown): value is () => Promise<ReactNode> {
    return typeof value === "function" && value.constructor.name === "AsyncFunction";
  }
  if (isAsyncComponent(node.type)) {
    const result = await resolve(await node.type());
    return isValidElement(result) ? cloneElement(result, { key: node.key }) : result;
  }
  if (node.props.children === undefined) return node;
  return cloneElement(node, { children: await resolve(node.props.children) });
}

async function render() {
  return renderToStaticMarkup(await resolve(Overview()));
}

function action(index: number, status: ActionStatus = "proposed"): ReminderAction {
  return {
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    invoiceId: "40000000-0000-4000-8000-000000000099",
    invoiceNumber: `INV-${index}`,
    paymentId: null,
    paypalAction: "send_invoice_reminder",
    status,
    payload: { stage: 30 },
    error: null,
    createdAt: "2026-11-01T00:00:00Z",
  };
}

function event(index: number, state: CalendarEvent["state"]): CalendarEvent {
  return {
    id: `event-${index}`,
    date: `2026-11-${String(index).padStart(2, "0")}`,
    kind: "rbi_deadline",
    title: `Deadline ${index}`,
    state,
    href: `/invoices#invoice-${index}`,
    ruleId: null,
  };
}

it("renders tile values, only proposed approvals, and the IST header date", async () => {
  responses.set("/close", { runs: [], approvals: [action(1), action(2), action(3, "done")] });
  responses.set("/calendar", [event(5, "upcoming"), event(4, "overdue")]);
  responses.set("/health-check", {
    score: 62,
    checkedOn: "2026-11-01",
    suggestion: null,
    flags: [
      {
        code: "lut_expired",
        severity: "high",
        message: "Expired",
        note: "Verify with your CA.",
        citation: { ruleId: "LUT", source: "Test", effectiveFrom: null },
      },
    ],
  });
  responses.set(
    "/tasks",
    ["open", "open", "done"].map((status, index) => ({
      id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      type: "agent_suggestion",
      status,
      message: "Check",
      dueDate: null,
      invoiceId: null,
      sourceRuleId: "Test",
      createdAt: "2026-11-01T00:00:00Z",
      doneAt: null,
    })),
  );
  const html = await render();
  expect(metadata.title).toBe("Today");
  expect(html.match(/<h1>/g)).toHaveLength(1);
  expect(html).toContain("2 Nov 2026");
  expect(html).toContain('<h2>Approvals waiting</h2><p class="stat-value">2</p>');
  expect(html).toContain('class="stat-tile" data-tone="attention"');
  expect(html).toContain('<h2>Open tasks</h2><p class="stat-value">2</p>');
  expect(html).toContain('<h2>Health score</h2><p class="stat-value">62 / 100</p>');
  expect(html).toContain('class="stat-tile" data-tone="danger"');
  expect(html).toContain("1 high-priority flags");
  expect(html).toContain('data-tone="danger">1 overdue</span>');
  expect(html).toContain('href="/invoices#invoice-4"');
  expect(html).toContain("4 Nov 2026");
  expect(html.match(/class="card approval-card"/g)).toHaveLength(2);
  expect(html).not.toContain("invoice INV-3");
});

it("shows the no-profile tile, empty approvals without an accent edge, and no scheduled deadlines", async () => {
  const html = await render();
  expect(html).toContain('class="stat-tile" data-tone="neutral" href="/profile"');
  expect(html).toContain('<p class="stat-value">—</p>');
  expect(html).toContain("Complete your profile");
  expect(html).toContain("Nothing to approve");
  expect(html).toContain("Niryat proposes PayPal reminders here when a deadline gets close.");
  expect(html).not.toContain('data-tone="attention"');
  expect(html).not.toContain("overdue</span>");
  expect(html).toContain("None scheduled");
});

it.each([
  ["medium", "attention"],
  ["low", "success"],
  [null, "success"],
])("uses the highest flag severity %s for the health tone", async (severity, tone) => {
  responses.set("/health-check", {
    score: 80,
    checkedOn: "2026-11-01",
    suggestion: null,
    flags: severity
      ? [
          {
            code: "lut_expiring",
            severity,
            message: "Check",
            note: "Verify with your CA.",
            citation: { ruleId: "Test", source: "Test", effectiveFrom: null },
          },
        ]
      : [],
  });
  const html = await render();
  expect(html).toContain(`class="stat-tile" data-tone="${tone}" href="/health-check"`);
  expect(html).toContain("No high-priority flags");
});

it("caps approval cards at three and retains every overdue plus five upcoming deadlines", async () => {
  responses.set("/close", { runs: [], approvals: [1, 2, 3, 4].map((index) => action(index)) });
  responses.set("/calendar", [
    event(2, "overdue"),
    event(1, "overdue"),
    ...[9, 8, 7, 6, 5, 4].map((index) => event(index, "upcoming")),
  ]);
  const html = await render();
  expect(html.match(/class="card approval-card"/g)).toHaveLength(3);
  expect(html).toContain("All approvals");
  expect(html).toContain('data-tone="danger">2 overdue</span>');
  expect(html).toContain('href="/invoices#invoice-8"');
  expect(html).not.toContain('href="/invoices#invoice-9"');
  expect(html.indexOf("Deadline 1</a>")).toBeLessThan(html.indexOf("Deadline 2</a>"));
});

it("shows the first five invoices in API order with formatted amounts and anchor links", async () => {
  responses.set(
    "/invoices",
    [6, 2, 5, 1, 4, 3].map((index) => ({
      id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      clientId: "40000000-0000-4000-8000-000000000099",
      clientName: "Acme",
      type: "one_time",
      number: `INV-${index}`,
      fy: "2026-27",
      date: "2026-11-01",
      currency: "USD",
      amount: "1234.50",
      description: "Work",
      sac: "998314",
      recurrence: null,
      status: "paid",
      pdfUrl: null,
      paypalInvoiceId: null,
      paypalRecurringSeriesId: null,
      paidTotal: "1234.50",
      payments: [],
      firaStatus: "pending",
      refundedTotal: "0",
      refunds: [],
      disputes: [],
      action: null,
      refundActions: [],
      compliance: {
        realisation: {
          exportValue: "1234.50",
          received: "1234.50",
          shortfall: "0.00",
          adjustment: "none",
          message: null,
          citation: { ruleId: "RBI", source: "Test", effectiveFrom: null },
        },
        deadline: null,
        creditNotes: [],
        disputeAlerts: [],
      },
    })),
  );
  const html = await render();
  expect(html.match(/class="mono" href="\/invoices#invoice-/g)).toHaveLength(5);
  expect(html.indexOf("INV-6</a>")).toBeLessThan(html.indexOf("INV-2</a>"));
  expect(html.indexOf("INV-2</a>")).toBeLessThan(html.indexOf("INV-5</a>"));
  expect(html).not.toContain("INV-3</a>");
  expect(html).toContain('class="num">$1,234.50</td>');
  expect(html).toContain('data-tone="success">Paid</span>');
  expect(html).toContain("All invoices");
});

it.each([
  ["login", "freelancer", "/api/auth/login", "/overview"],
  ["signup", "freelancer", "/api/auth/signup", "/overview"],
  ["login", "ca", "/api/auth/ca/login", "/ca"],
  ["signup", "ca", "/api/auth/ca/signup", "/ca"],
] as const)(
  "submits %s for %s to %s then navigates to %s",
  async (mode, audience, endpoint, destination) => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    const form = AuthForm({ mode, audience });
    const preventDefault = vi.fn();
    vi.stubGlobal(
      "FormData",
      class extends FormData {
        constructor() {
          super();
          this.set("email", "ananya@example.com");
          this.set("password", "long-test-password");
        }
      },
    );
    try {
      await form.props.onSubmit({ preventDefault, currentTarget: {} });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(sendJson).toHaveBeenCalledExactlyOnceWith(endpoint, "POST", {
        email: "ananya@example.com",
        password: "long-test-password",
      });
      expect(replace).toHaveBeenCalledExactlyOnceWith(destination);
      expect(setState).toHaveBeenCalledWith(true);
      expect(setState).not.toHaveBeenCalledWith(false);
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
