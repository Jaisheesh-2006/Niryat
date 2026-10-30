import {
  type Action,
  type AgentRun,
  type CloseSummary,
  invoiceViewSchema,
  type ReminderAction,
  taskSchema,
} from "@niryat/shared";
import {
  Children,
  type EffectCallback,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Close from "../app/close/page";
import Invoices from "../app/invoices/page";
import Tasks from "../app/tasks/page";
import { apiGet } from "../lib/api";
import { ActionButtons } from "./ActionButtons";
import { CloseButton } from "./CloseButton";
import { CloseRefresher } from "./CloseRefresher";

const { refresh, hooks } = vi.hoisted(() => ({
  refresh: vi.fn(),
  hooks: { values: [] as unknown[], cursor: 0, effects: [] as EffectCallback[] },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../lib/api", () => ({ apiGet: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect: (effect: EffectCallback) => hooks.effects.push(effect),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetAllMocks();
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
});

const unknownOutcome =
  "PayPal may have accepted this reminder. Check PayPal before taking further action. This reminder cannot be resent.";
const inProgress =
  "A reminder attempt is in progress or its outcome is unknown. Check PayPal before taking further action. This reminder cannot be resent.";
const failed =
  "The reminder attempt failed. This reminder cannot be retried. You can reject this proposal.";
const reload =
  "Unable to confirm this reminder&#x27;s status. Reload this page to check it before taking further action.";
const action: ReminderAction = {
  id: "10000000-0000-4000-8000-000000000001",
  invoiceId: "10000000-0000-4000-8000-000000000002",
  invoiceNumber: "2026-27/0001",
  paymentId: null,
  paypalAction: "send_invoice_reminder",
  status: "proposed",
  error: null,
  createdAt: "2026-10-31T00:00:00Z",
  payload: {
    stage: 60,
    agent: { advice: "hold", reason: "Check the open dispute first." },
    remind: { send_to_invoicer: false, send_to_recipient: true },
  },
};

function renderAction(value: Action = action) {
  hooks.cursor = 0;
  const element = ActionButtons({ action: value });
  if (typeof element.type !== "function") return element;
  const result: unknown = Reflect.apply(element.type, undefined, [element.props]);
  if (!isValidElement<{ children?: ReactNode }>(result))
    throw new Error("Expected action controls");
  return result;
}

function buttons(node: ReactNode): ReactElement<{
  children?: ReactNode;
  disabled: boolean;
  onClick: () => Promise<void>;
}>[] {
  return Children.toArray(node).flatMap((child) => {
    if (
      !isValidElement<{ children?: ReactNode; disabled: boolean; onClick: () => Promise<void> }>(
        child,
      )
    )
      return [];
    return child.type === "button" ? [child] : buttons(child.props.children);
  });
}

it.each([
  ["approved", null, inProgress, 0],
  ["failed", "reminder_outcome_unknown", unknownOutcome, 0],
  ["failed", "reminder_not_needed", failed, 1],
  ["done", null, "Reminder request accepted by PayPal.", 0],
  ["rejected", null, "Rejected. Nothing was sent to PayPal.", 0],
] as const)("renders reminder %s/%s controls", (status, error, message, count) => {
  const tree = renderAction({ ...action, status, error });
  expect(renderToStaticMarkup(tree)).toContain(message);
  expect(buttons(tree)).toHaveLength(count);
  if (count) expect(buttons(tree)[0]?.props.children).toBe("Reject");
});

it("shows the standard reminder, internal advice and only the PayPal reminder request", () => {
  const html = renderToStaticMarkup(renderAction());
  expect(html).toContain("Send PayPal&#x27;s standard reminder");
  expect(html).toContain("Claude suggests holding this reminder:");
  expect(html).toContain(
    "PayPal sends its standard reminder. Claude&#x27;s advice stays in Niryat.",
  );
  expect(html).toContain("send_to_recipient");
  const preview = html.match(/<pre>(.*?)<\/pre>/s)?.[1];
  expect(preview).not.toMatch(/agent|reason|subject|note|stage/);
  expect(html).not.toMatch(/email draft|email preview/i);
});

it.each([
  "unknown",
  "interrupted",
  "unreadable",
  "refresh throws",
  "unchanged",
  "definite",
  "paypal rejection",
  "done",
])("locks approval through %s and refreshes without resubmitting", async (outcome) => {
  const response = Promise.withResolvers<Response>();
  const fetch = vi.fn().mockReturnValue(response.promise);
  vi.stubGlobal("fetch", fetch);
  if (outcome === "refresh throws")
    refresh.mockImplementation(() => {
      throw new Error("refresh_failed");
    });
  const approve = buttons(renderAction())[0];
  if (!approve) throw new Error("Expected approval");
  const pending = approve.props.onClick();
  await approve.props.onClick();
  expect(buttons(renderAction()).every((button) => button.props.disabled)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  if (outcome === "interrupted") response.reject(new Error("network_interrupted"));
  else if (outcome === "unreadable") response.resolve(new Response("invalid", { status: 502 }));
  else if (outcome === "done") response.resolve(new Response(null, { status: 200 }));
  else
    response.resolve(
      Response.json(
        {
          error: "paypal_failed",
          code:
            outcome === "definite"
              ? "reminder_not_needed"
              : outcome === "paypal rejection"
                ? "INVALID_REQUEST"
                : "reminder_outcome_unknown",
        },
        { status: 502 },
      ),
    );
  await pending;
  expect(refresh).toHaveBeenCalledOnce();
  const unchanged = renderAction({ ...action });
  expect(buttons(unchanged).every((button) => button.props.disabled)).toBe(true);
  expect(renderToStaticMarkup(unchanged)).toContain(reload);
  expect(renderToStaticMarkup(unchanged)).not.toMatch(/Try again|approve again to retry/);
  expect(renderToStaticMarkup(unchanged)).toContain(
    outcome === "interrupted" || outcome === "unreadable"
      ? reload
      : outcome === "done"
        ? reload
        : outcome === "definite"
          ? "This invoice no longer needs a reminder. Reject this proposal."
          : outcome === "paypal rejection"
            ? failed
            : unknownOutcome,
  );
  for (const button of buttons(unchanged)) await button.props.onClick();
  expect(fetch).toHaveBeenCalledTimes(1);

  if (outcome === "done") {
    expect(renderToStaticMarkup(renderAction({ ...action, status: "done" }))).toContain(
      "Reminder request accepted by PayPal.",
    );
  } else if (outcome === "definite" || outcome === "paypal rejection") {
    const tree = renderAction({
      ...action,
      status: "failed",
      error: outcome === "definite" ? "reminder_not_needed" : "INVALID_REQUEST",
    });
    expect(buttons(tree).map((button) => [button.props.children, button.props.disabled])).toEqual([
      ["Reject", false],
    ]);
    fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await buttons(tree)[0]?.props.onClick();
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/actions/${action.id}/reject`,
      expect.objectContaining({ method: "POST" }),
    );
  } else {
    const tree = renderAction({ ...action, status: "failed", error: "reminder_outcome_unknown" });
    expect(buttons(tree)).toHaveLength(0);
    expect(renderToStaticMarkup(tree)).toContain(unknownOutcome);
  }
});

it.each(["send_invoice", "refund_payment"] as const)(
  "keeps retries for failed %s",
  async (paypalAction) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    const value = { ...action, paypalAction, status: "failed" } as const;
    await buttons(renderAction(value))[0]?.props.onClick();
    const tree = renderAction(value);
    expect(renderToStaticMarkup(tree)).toContain("You can approve again to retry.");
    expect(buttons(tree).every((button) => !button.props.disabled)).toBe(true);
    await buttons(tree)[0]?.props.onClick();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it("posts a manual close, prevents repeated clicks and shows the running/error states", async () => {
  const response = Promise.withResolvers<Response>();
  const fetch = vi.fn().mockReturnValue(response.promise);
  vi.stubGlobal("fetch", fetch);
  const button = buttons(CloseButton())[0];
  if (!button) throw new Error("Expected close button");
  const pending = button.props.onClick();
  await button.props.onClick();
  hooks.cursor = 0;
  expect(renderToStaticMarkup(CloseButton())).toContain("Closing…");
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  response.resolve(Response.json({ error: "close_running" }, { status: 409 }));
  await pending;
  hooks.cursor = 0;
  expect(renderToStaticMarkup(CloseButton())).toContain(
    "A close is already running. Wait for it to finish.",
  );
  expect(refresh).not.toHaveBeenCalled();
  fetch.mockResolvedValue(new Response(null, { status: 202 }));
  hooks.cursor = 0;
  await buttons(CloseButton())[0]?.props.onClick();
  expect(refresh).toHaveBeenCalledOnce();
});

it("refreshes every three seconds and stops when unmounted", () => {
  vi.useFakeTimers();
  CloseRefresher();
  const cleanup = hooks.effects[0]?.();
  vi.advanceTimersByTime(2999);
  expect(refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(6001);
  expect(refresh).toHaveBeenCalledTimes(3);
  if (typeof cleanup === "function") cleanup();
  vi.advanceTimersByTime(6000);
  expect(refresh).toHaveBeenCalledTimes(3);
});

const summary: CloseSummary = {
  month: "2026-10",
  asOf: "2026-12-01",
  payments: { count: 2, totals: [{ currency: "USD", gross: "1500.00", fee: null, net: null }] },
  refunds: { count: 1, totals: [{ currency: "USD", gross: "100.00" }] },
  openDisputes: 1,
  fira: { state: "missing", needsConfirmation: 2, unmatched: 1 },
  deadlines: [
    {
      invoiceId: action.invoiceId,
      invoiceNumber: action.invoiceNumber,
      deadline: "2026-12-31",
      daysRemaining: 30,
      stage: 30,
      overdue: false,
    },
  ],
  proposals: [],
  suggestedTasks: 1,
  tasksCreated: 1,
  focus: [{ label: "Invoice to Acme", reason: "Check the dispute first." }],
  sync: { payments: "failed", disputes: "done" },
  ai: { status: "failed", costUsd: "0.10" },
  note: "Review the dispute before sending.",
  citations: [{ ruleId: "RBI_REALISATION", source: "Test citation", effectiveFrom: null }],
};
const run: AgentRun = {
  id: "10000000-0000-4000-8000-000000000003",
  kind: "monthly_close",
  trigger: "scheduled",
  month: summary.month,
  asOf: summary.asOf,
  status: "completed",
  error: null,
  startedAt: "2026-10-31T18:30:00Z",
  finishedAt: "2026-10-31T18:31:00Z",
  summary,
  toolCalls: [
    {
      seq: 1,
      actor: "agent",
      tool: "paypal_get_invoice",
      input: { invoiceId: action.invoiceId },
      output: { items: 1, bytes: 50, error: null },
      ok: true,
      createdAt: "2026-10-31T18:30:01Z",
    },
  ],
};

it("renders failed AI with retained drafts, figures, priorities, reminders and tool logs", async () => {
  vi.mocked(apiGet).mockResolvedValue({
    runs: [run],
    approvals: [
      action,
      { ...action, id: "approved", status: "approved" },
      { ...action, id: "unknown", status: "failed", error: "reminder_outcome_unknown" },
      { ...action, id: "definite", status: "failed", error: "reminder_not_needed" },
      { ...action, id: "done", status: "done" },
      { ...action, id: "rejected", status: "rejected" },
    ],
  });
  const html = renderToStaticMarkup(await Close());
  expect(apiGet).toHaveBeenCalledWith("/close", expect.anything());
  for (const text of [
    "What to do first",
    "Check the dispute first.",
    "Summary for October 2026",
    "As of 2026-12-01",
    "Gross 1500.00, PayPal fees Not provided by PayPal, net Not provided by PayPal",
    "Missing: upload it on the FIRA page; 2 lines need your confirmation; 1 lines not matched",
    "PayPal sync failed; figures may be incomplete.",
    "The AI step failed.",
    "Note from Claude",
    "Monthly close (scheduled) 2026-11-01: Completed",
    "Tool calls (1)",
    "paypal_get_invoice",
    "Test citation",
    inProgress,
    unknownOutcome,
    failed,
    "Accepted by PayPal",
    "Rejected",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Reviewed by Claude.");
  expect(html.match(/Send PayPal&#x27;s standard reminder/g)).toHaveLength(1);
  expect(html.match(/<button[^>]*>Reject<\/button>/g)).toHaveLength(2);
});

it.each(["covered", "not_due", "not_needed"] as const)(
  "renders FIRA %s and polls only running runs",
  async (state) => {
    vi.mocked(apiGet).mockResolvedValue({
      runs: [
        {
          ...run,
          status: "running",
          summary: {
            ...summary,
            ai: { status: "used", costUsd: "0" },
            fira: { state, needsConfirmation: 0, unmatched: 0 },
          },
        },
      ],
      approvals: [],
    });
    const html = renderToStaticMarkup(await Close());
    expect(html).toContain("Closing October 2026… This page refreshes until it finishes.");
    expect(html).toContain(
      {
        covered: "Uploaded",
        not_due: "Not due yet (month in progress)",
        not_needed: "No PayPal payments this month",
      }[state],
    );
    expect(html).toContain("No PayPal actions to approve.");
    expect(html).toContain("Reviewed by Claude.");
    expect(hooks.effects).toHaveLength(1);
  },
);

it.each([
  ["fira_missing", "FIRA missing"],
  ["rbi_deadline_passed", "RBI deadline passed"],
  ["agent_suggestion", "Suggested by Claude"],
])("renders the %s task label", async (type, label) => {
  vi.mocked(apiGet).mockResolvedValue([
    taskSchema.parse({
      id: action.id,
      type,
      status: "open",
      message: "Check this record.",
      dueDate: null,
      invoiceId: null,
      sourceRuleId: "RBI_REALISATION",
      createdAt: action.createdAt,
      doneAt: null,
    }),
  ]);
  expect(renderToStaticMarkup(await Tasks())).toContain(`<h2>${label}</h2>`);
});

it.each([true, false])(
  "renders invoice deadlines and distinguishes reminder stages: %s",
  async (unpaid) => {
    const invoice = invoiceViewSchema.parse({
      id: action.invoiceId,
      clientId: action.invoiceId,
      clientName: "Acme",
      type: "one_time",
      number: action.invoiceNumber,
      fy: "2026-27",
      date: "2026-01-30",
      currency: "USD",
      amount: "1500.00",
      description: "Dashboard",
      sac: "998314",
      recurrence: null,
      status: unpaid ? "sent" : "paid",
      pdfUrl: null,
      paypalInvoiceId: "INV2-TEST",
      paypalRecurringSeriesId: null,
      paidTotal: unpaid ? "0.00" : "1500.00",
      payments: [],
      firaStatus: "pending",
      refundedTotal: "0.00",
      refunds: [],
      disputes: [],
      action: null,
      refundActions: [],
      compliance: {
        realisation: {
          exportValue: "1500.00",
          received: "0.00",
          shortfall: "1500.00",
          adjustment: "none",
          message: null,
          citation: summary.citations[0],
        },
        deadline: unpaid
          ? {
              deadline: "2026-10-30",
              daysRemaining: -1,
              stage: null,
              overdue: true,
              uncertainWindow: false,
              message: "Test deadline message",
              citation: summary.citations[0],
            }
          : null,
        creditNotes: [],
        disputeAlerts: [],
      },
    });
    vi.mocked(apiGet)
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        runs: [],
        approvals: [
          { ...action, status: "failed", error: "reminder_outcome_unknown" },
          ...(unpaid
            ? [
                { ...action, id: "10000000-0000-4000-8000-000000000004" },
                {
                  ...action,
                  id: "10000000-0000-4000-8000-000000000005",
                  payload: { ...action.payload, stage: 30 },
                },
              ]
            : []),
        ],
      });
    const html = renderToStaticMarkup(await Invoices());
    expect(apiGet).toHaveBeenCalledWith("/close", expect.anything());
    expect(html.includes("<h3>RBI deadline</h3>")).toBe(unpaid);
    if (unpaid) {
      expect(html).toContain("<dt>Receive full payment by</dt><dd>2026-10-30</dd>");
      expect(html).toContain("Overdue by 1 day");
      expect(html).toContain("Test deadline message");
      expect(html).toContain("Test citation");
      for (const stage of [60, 30]) {
        expect(html).toContain(
          `Invoice ${action.invoiceNumber}: reminder ${stage} days before the RBI deadline</p><div><h3>Waiting for your approval</h3>`,
        );
      }
    }
    expect(html).toContain(unknownOutcome);
    expect(html.match(/Send PayPal&#x27;s standard reminder/g) ?? []).toHaveLength(unpaid ? 2 : 0);
    expect(html).not.toContain("approve again to retry");
  },
);
