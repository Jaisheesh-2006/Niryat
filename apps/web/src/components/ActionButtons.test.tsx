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
import Close from "../app/(app)/close/page";
import Invoices from "../app/(app)/invoices/page";
import Tasks from "../app/(app)/tasks/page";
import { apiGet } from "../lib/api";
import { ActionButtons } from "./ActionButtons";
import { ApprovalCard } from "./ApprovalCard";
import { CloseButton } from "./CloseButton";
import { CloseRefresher } from "./CloseRefresher";
import { OverviewApprovals } from "./OverviewApprovals";
import { TaskDoneButton } from "./TaskDoneButton";

const { refresh, hooks } = vi.hoisted(() => ({
  refresh: vi.fn(),
  hooks: {
    values: [] as unknown[],
    cursor: 0,
    effects: [] as EffectCallback[],
    transitionErrors: [] as unknown[],
  },
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
  useTransition: () => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = false;
    return [
      hooks.values[index],
      (fn: () => unknown) => {
        try {
          const result = fn();
          if (!(result instanceof Promise)) return result;
          hooks.values[index] = true;
          return result.finally(() => {
            hooks.values[index] = false;
          });
        } catch (error) {
          hooks.transitionErrors.push(error);
        }
      },
    ];
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetAllMocks();
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.transitionErrors = [];
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

it("disables a simple caller while its transition is pending", () => {
  hooks.values[0] = true;
  expect(buttons(TaskDoneButton({ taskId: action.id }))[0]?.props.disabled).toBe(true);
});

it.each(["proposed", "failed"] as const)("gives the approval card its %s edge hook", (status) => {
  const html = renderToStaticMarkup(
    <ApprovalCard
      action={{ ...action, status }}
      title="Send a reminder"
      kind="Reminder · 60-day stage"
      facts={[{ label: "Amount", value: "$1,200.00" }]}
    />,
  );
  expect(html).toContain(`class="card approval-card" data-status="${status}"`);
  expect(html).toContain("<h3>Send a reminder</h3>");
  expect(html).toContain("Reminder · 60-day stage");
  expect(html).toContain("<dt>Amount</dt><dd>$1,200.00</dd>");
  expect(html).toContain('class="suggestion"');
  expect(html).toContain("Suggestion from Claude");
  expect(html).toContain('class="btn" data-variant="ghost"');
  if (status === "proposed") {
    expect(html.match(/Waiting for your approval/g)).toHaveLength(1);
    expect(html).toContain("Nothing is sent to PayPal until you approve.");
  }
});

it.each(["done", "rejected"] as const)(
  "collapses a %s approval to its badge, title and date",
  (status) => {
    const html = renderToStaticMarkup(
      <ApprovalCard
        action={{ ...action, status }}
        title="Send a reminder"
        kind="Reminder · 60-day stage"
        facts={[{ label: "Amount", value: "$1,200.00" }]}
      />,
    );
    expect(html).toContain(`data-status="${status}"`);
    expect(html).toContain(`>${status === "done" ? "Done" : "Rejected"}</span>`);
    expect(html).toContain("<h3>Send a reminder</h3>");
    expect(html).toContain('<time dateTime="2026-10-31T00:00:00Z">31 Oct 2026</time>');
    expect(html).not.toMatch(/<button|<details|<dl|suggestion|60-day stage/);
  },
);

it("uses danger for refund approval and secondary for rejection", () => {
  const html = renderToStaticMarkup(renderAction({ ...action, paypalAction: "refund_payment" }));
  expect(html).toContain('class="btn" data-variant="danger"');
  expect(html).toContain('class="btn" data-variant="secondary"');
});

it.each(["approved", "done", "rejected"] as const)(
  "focuses the %s outcome only after a decision in this instance",
  async (status) => {
    const value = { ...action, paypalAction: "send_invoice" } as const;
    renderAction(value);
    for (const effect of hooks.effects.splice(0)) effect();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await buttons(renderAction(value))[0]?.props.onClick();
    const tree = renderAction({ ...value, status });
    if (!isValidElement<{ ref: { current: { focus: () => void } | null }; tabIndex: number }>(tree))
      throw new Error("Expected an outcome");
    const focus = vi.fn();
    tree.props.ref.current = { focus };
    expect(tree.props.tabIndex).toBe(-1);
    for (const effect of hooks.effects.splice(0)) effect();
    expect(focus).toHaveBeenCalledOnce();
  },
);

it("does not focus an outcome on first render", () => {
  const tree = renderAction({ ...action, paypalAction: "send_invoice", status: "done" });
  if (!isValidElement<{ ref: { current: { focus: () => void } | null } }>(tree))
    throw new Error("Expected an outcome");
  const focus = vi.fn();
  tree.props.ref.current = { focus };
  for (const effect of hooks.effects.splice(0)) effect();
  expect(focus).not.toHaveBeenCalled();
});

it.each([
  ["done", null, "Reminder request accepted by PayPal."],
  ["rejected", null, "Rejected. Nothing was sent to PayPal."],
  ["approved", null, inProgress],
  ["failed", "INVALID_REQUEST", failed],
  ["failed", "reminder_outcome_unknown", unknownOutcome],
] as const)(
  "keeps Today’s %s/%s outcome mounted and focusable after refresh",
  async (status, error, message) => {
    function renderOverview(approvals: readonly ReminderAction[]) {
      hooks.cursor = 0;
      const list = OverviewApprovals({ approvals });
      const cards = Children.toArray(list.props.children).filter(
        (child) => isValidElement<{ action: ReminderAction }>(child) && child.type === ApprovalCard,
      );
      const card = cards[0];
      if (!isValidElement<{ action: ReminderAction }>(card))
        throw new Error("Expected retained card");
      const controls = ActionButtons({ action: card.props.action, inCard: true });
      if (typeof controls.type !== "function") throw new Error("Expected reminder controls");
      const tree: unknown = Reflect.apply(controls.type, undefined, [controls.props]);
      if (
        !isValidElement<{
          children?: ReactNode;
          outcomeRef?: { current: { focus: () => void } | null };
        }>(tree)
      )
        throw new Error("Expected outcome");
      return { cards, card, tree };
    }

    const others = [2, 3, 4].map((index) => ({
      ...action,
      id: `10000000-0000-4000-8000-00000000000${index}`,
    }));
    const before = renderOverview([action, ...others]);
    expect(before.cards).toHaveLength(3);
    for (const effect of hooks.effects.splice(0)) effect();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          status === "failed"
            ? Response.json({ error: "paypal_failed", code: error }, { status: 502 })
            : new Response(null, { status: 200 }),
        ),
    );
    await buttons(before.tree)[status === "rejected" ? 1 : 0]?.props.onClick();
    expect(refresh).toHaveBeenCalledOnce();

    const after = renderOverview([{ ...action, status, error }, ...others]);
    expect(after.cards).toHaveLength(3);
    expect(after.card.key).toBe(before.card.key);
    expect(after.card.props.action.status).toBe(status);
    expect(renderToStaticMarkup(after.tree)).toContain(message);
    const target = Children.toArray(after.tree.props.children).find(
      (child) =>
        isValidElement<{ tabIndex?: number; ref?: unknown }>(child) &&
        child.props.tabIndex === -1 &&
        child.props.ref,
    );
    const ref =
      after.tree.props.outcomeRef ??
      (isValidElement<{ ref: { current: { focus: () => void } | null } }>(target)
        ? target.props.ref
        : undefined);
    if (!ref) throw new Error("Expected focusable outcome");
    const focus = vi.fn();
    ref.current = { focus };
    for (const effect of hooks.effects.splice(0)) effect();
    expect(focus).toHaveBeenCalled();
    if (status === "approved" || error === "reminder_outcome_unknown")
      expect(buttons(after.tree)).toHaveLength(0);
  },
);

it("fills spare Today slots with new proposals without dropping displayed outcomes", () => {
  hooks.cursor = 0;
  OverviewApprovals({ approvals: [] });
  hooks.cursor = 0;
  const first = OverviewApprovals({ approvals: [action] });
  hooks.cursor = 0;
  const next = OverviewApprovals({
    approvals: [
      { ...action, id: "10000000-0000-4000-8000-000000000003" },
      { ...action, status: "done" },
    ],
  });
  const cards = Children.toArray(next.props.children);
  expect(cards).toHaveLength(2);
  const retained = cards.find(
    (card) =>
      isValidElement<{ action: ReminderAction }>(card) && card.props.action.id === action.id,
  );
  const original = Children.toArray(first.props.children)[0];
  expect(
    isValidElement(retained) && isValidElement(original) && retained.key === original.key,
  ).toBe(true);
});

it("focuses a new error after a decision", async () => {
  const value = { ...action, paypalAction: "send_invoice" } as const;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "action_not_pending" }, { status: 409 })),
  );
  await buttons(renderAction(value))[0]?.props.onClick();
  const tree = renderAction(value);
  const message = Children.toArray(tree.props.children).find(
    (child) => isValidElement<{ role?: string }>(child) && child.props.role === "alert",
  );
  if (
    !isValidElement<{ ref: { current: { focus: () => void } | null }; tabIndex: number }>(message)
  )
    throw new Error("Expected an error message");
  const focus = vi.fn();
  message.props.ref.current = { focus };
  expect(message.props.tabIndex).toBe(-1);
  for (const effect of hooks.effects.splice(0)) effect();
  expect(focus).toHaveBeenCalledOnce();
});

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

it("keeps standard reminders available without attributing missing advice to Claude", () => {
  const html = renderToStaticMarkup(
    renderAction({ ...action, payload: { ...action.payload, agent: null } }),
  );
  expect(html).not.toContain('class="suggestion"');
  expect(html).not.toContain("Suggestion from Claude");
  expect(html).toContain(
    "PayPal sends its standard reminder. Claude&#x27;s advice stays in Niryat.",
  );
  expect(html).toContain("Send PayPal&#x27;s standard reminder");
  expect(
    buttons(renderAction({ ...action, payload: { ...action.payload, agent: null } })),
  ).toHaveLength(2);
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
  expect(hooks.transitionErrors).toEqual([]);
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
  expect(renderToStaticMarkup(CloseButton())).toContain("Run monthly close");
  hooks.cursor = 0;
  const response = Promise.withResolvers<Response>();
  const fetch = vi.fn().mockReturnValue(response.promise);
  vi.stubGlobal("fetch", fetch);
  const button = buttons(CloseButton())[0];
  if (!button) throw new Error("Expected close button");
  const pending = button.props.onClick();
  await button.props.onClick();
  hooks.cursor = 0;
  const running = renderToStaticMarkup(CloseButton());
  expect(running).toContain("Closing…");
  expect(running).toContain('aria-busy="true"');
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
    "As of 1 Dec 2026",
    "Gross $1,500.00, PayPal fees Not provided by PayPal, net Not provided by PayPal",
    "Missing: upload it on the Payment proof page; 2 lines need your confirmation; 1 lines not matched",
    "PayPal sync failed; figures may be incomplete.",
    "The AI step failed.",
    "Note from Claude",
    "Monthly close (scheduled) 1 Nov 2026, 00:00 IST:",
    "Tool calls (1)",
    "Read a PayPal invoice",
    "Test citation",
    inProgress,
    unknownOutcome,
    failed,
    "Accepted by PayPal",
    "Rejected",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("Reviewed by Claude.");
  expect(html.match(/Send PayPal&#x27;s standard reminder/g)).toHaveLength(5);
  expect(html.match(/<button[^>]*>Reject<\/button>/g)).toHaveLength(2);
});

it("opens the latest tool log and its history, with older logs and raw details closed", async () => {
  const call = run.toolCalls[0];
  if (!call) throw new Error("Missing tool-call fixture");
  vi.mocked(apiGet).mockResolvedValue({
    runs: [
      run,
      {
        ...run,
        id: "10000000-0000-4000-8000-000000000004",
        startedAt: "2026-10-30T18:30:00Z",
        toolCalls: [{ ...call, actor: "system", tool: "future_tool", ok: false }],
      },
    ],
    approvals: [],
  });
  const html = renderToStaticMarkup(await Close());
  expect(html.match(/<details[^>]*><summary>[^<]*<\/summary>/g)).toEqual([
    '<details class="card" open=""><summary>History</summary>',
    '<details open=""><summary>Tool calls (1)</summary>',
    "<details><summary>Show details</summary>",
    "<details><summary>Tool calls (1)</summary>",
    "<details><summary>Show details</summary>",
  ]);
  expect(html).toContain("<td>Claude</td><td>Read a PayPal invoice</td>");
  expect(html).toContain("<td>Niryat</td><td>future_tool</td><td>Failed");
  expect(html.replace(/\s+/g, " ")).toContain(
    "Claude read your PayPal records with read-only tools. Nothing was sent or changed. Every PayPal action below waits for your approval.",
  );
  expect(html.match(/Claude read your PayPal records/g)).toHaveLength(1);
  expect(html).toContain("<p>Every PayPal action below waits for your approval.</p>");
  expect(html).toContain("<details><summary>Show details</summary><pre>");
  expect(html).toContain("&quot;input&quot;");
  expect(html).toContain("&quot;output&quot;");
  expect(html).toContain(action.invoiceId);
});

it("keeps empty history closed when there are no runs", async () => {
  vi.mocked(apiGet).mockResolvedValue({ runs: [], approvals: [] });
  const html = renderToStaticMarkup(await Close());
  expect(html).toContain('<details class="card"><summary>History</summary>');
  expect(html).not.toContain("Tool calls (");
});

it.each(["unavailable", "budget_exhausted"] as const)(
  "does not claim Claude read PayPal when AI is %s",
  async (status) => {
    vi.mocked(apiGet).mockResolvedValue({
      runs: [
        {
          ...run,
          summary: { ...summary, ai: { status, costUsd: "0" } },
          toolCalls: run.toolCalls.map((call) => ({
            ...call,
            actor: "system",
            tool: "claude",
            output: { status, costUsd: "0" },
          })),
        },
      ],
      approvals: [],
    });
    const html = renderToStaticMarkup(await Close());
    expect(html).not.toContain("Claude read your PayPal records");
    expect(html).toContain("<p>Every PayPal action below waits for your approval.</p>");
    expect(html).toContain(
      status === "unavailable" ? "AI is not configured." : "The monthly AI budget is used up.",
    );
  },
);

it.each(["running", "completed"] as const)(
  "does not claim Claude read PayPal for an empty %s run",
  async (status) => {
    vi.mocked(apiGet).mockResolvedValue({
      runs: [{ ...run, status, summary: null, toolCalls: [] }],
      approvals: [],
    });
    const html = renderToStaticMarkup(await Close());
    expect(html).not.toContain("Claude read your PayPal records");
    expect(html).toContain("<p>Every PayPal action below waits for your approval.</p>");
    expect(html).toContain('<details open=""><summary>Tool calls (0)</summary>');
  },
);

it.each([
  ["a failed PayPal read", "agent", "paypal_get_invoice", false],
  ["a local agent read", "agent", "get_month_overview", true],
  ["a system read", "system", "paypal_get_invoice", true],
  ["an unknown PayPal tool", "agent", "paypal_future_tool", true],
] as const)("does not claim Claude read PayPal after %s", async (_case, actor, tool, ok) => {
  vi.mocked(apiGet).mockResolvedValue({
    runs: [{ ...run, toolCalls: run.toolCalls.map((call) => ({ ...call, actor, tool, ok })) }],
    approvals: [],
  });
  const html = renderToStaticMarkup(await Close());
  expect(html).not.toContain("Claude read your PayPal records");
  expect(html).toContain("<p>Every PayPal action below waits for your approval.</p>");
});

it.each([
  "paypal_get_invoice",
  "paypal_list_invoices",
  "paypal_get_dispute",
  "paypal_list_disputes",
  "paypal_list_transactions",
])("reports the successful %s read even if AI later failed", async (tool) => {
  vi.mocked(apiGet).mockResolvedValue({
    runs: [{ ...run, toolCalls: run.toolCalls.map((call) => ({ ...call, tool })) }],
    approvals: [],
  });
  const html = renderToStaticMarkup(await Close());
  expect(html).toContain("The AI step failed.");
  expect(html).toContain(
    "Claude read your PayPal records with read-only tools. Nothing was sent or changed.",
  );
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
    expect(html).toContain("Nothing to approve");
    expect(html).toContain("Reviewed by Claude.");
    expect(hooks.effects).toHaveLength(1);
  },
);

it.each([
  ["fira_missing", "Payment proof missing"],
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
      plannedDate: null,
      invoiceId: null,
      sourceRuleId: "RBI_REALISATION",
      createdAt: action.createdAt,
      doneAt: null,
    }),
  ]);
  expect(renderToStaticMarkup(await Tasks())).toContain(`<strong>${label}</strong>`);
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
    expect(html).toContain(`id="invoice-${invoice.id}"`);
    expect(html).toContain('<details class="card"><summary>New invoice</summary>');
    expect(html.includes("<h3>RBI deadline</h3>")).toBe(unpaid);
    if (unpaid) {
      expect(html).toContain("<dt>Amount</dt><dd>$1,500.00</dd>");
      expect(html).toContain("<dt>Receive full payment by</dt><dd>30 Oct 2026</dd>");
      expect(html).toContain("Overdue by 1 day");
      expect(html).toContain("Test deadline message");
      expect(html).toContain("Test citation");
      for (const stage of [60, 30]) {
        expect(html).toContain(`Reminder \u00b7 ${stage}-day stage`);
      }
    }
    expect(html).toContain(unknownOutcome);
    expect(html.match(/Send PayPal&#x27;s standard reminder/g) ?? []).toHaveLength(unpaid ? 5 : 1);
    expect(html).not.toContain("approve again to retry");
  },
);

it("opens the new invoice form only when there are no invoices", async () => {
  vi.mocked(apiGet)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ runs: [], approvals: [] });
  const html = renderToStaticMarkup(await Invoices());
  expect(html).toContain('<details class="card" open=""><summary>New invoice</summary>');
  expect(html).toContain("No invoices yet");
  expect(html).toContain("Paste a client email and Claude fills in the invoice for you.");
});

it("renders credit notes and offers refunds only for ordinary payments", async () => {
  const invoice = invoiceViewSchema.parse({
    id: action.invoiceId,
    clientId: action.invoiceId,
    clientName: "Acme",
    type: "one_time",
    number: action.invoiceNumber,
    fy: "2026-27",
    date: "2026-01-30",
    currency: "USD",
    amount: "100.00",
    description: "Dashboard",
    sac: "998314",
    recurrence: null,
    status: "partially_refunded",
    pdfUrl: null,
    paypalInvoiceId: "INV2-TEST",
    paypalRecurringSeriesId: null,
    paidTotal: "100.00",
    payments: ["JUDGE-SYNTHETIC-0-0", "CAPTURE-REAL"].map((paypalTxnId, index) => ({
      id: `30000000-0000-4000-8000-00000000000${index + 1}`,
      paypalTxnId,
      gross: "50.00",
      fee: "1.50",
      net: "48.50",
      currency: "USD",
      fxRate: null,
      receivedAt: "2026-01-30T12:00:00Z",
      fira: null,
    })),
    firaStatus: "pending",
    refundedTotal: "40.00",
    refunds: [],
    disputes: [],
    action: null,
    refundActions: [
      {
        ...action,
        paymentId: action.invoiceId,
        paypalAction: "refund_payment",
        payload: {
          invoiceId: action.invoiceId,
          paymentId: action.invoiceId,
          captureId: "CAPTURE-1",
          refund: { amount: { currency_code: "USD", value: "40.00" } },
        },
      },
    ],
    compliance: {
      realisation: {
        exportValue: "100.00",
        received: "60.00",
        shortfall: "40.00",
        adjustment: "none",
        message: null,
        citation: summary.citations[0],
      },
      deadline: null,
      creditNotes: [
        {
          refundId: "REFUND-1",
          originalInvoice: action.invoiceNumber,
          originalDate: "2026-01-30",
          value: "USD 40.00",
          igst: "USD 0.00",
          declareBy: "2027-11-30",
          late: false,
          message: "Review this credit note with your CA.",
          citation: summary.citations[0],
        },
      ],
      disputeAlerts: [],
    },
  });
  vi.mocked(apiGet)
    .mockResolvedValueOnce([invoice])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ runs: [], approvals: [] });
  const html = renderToStaticMarkup(await Invoices());
  expect(html).toContain("<details><summary>Details</summary>");
  expect(html).toContain("<dt>Credit value</dt><dd>USD 40.00</dd>");
  expect(html).toContain("<dt>IGST</dt><dd>USD 0.00</dd>");
  expect(html).toContain("<dt>Invoice amount</dt><dd>$100.00</dd>");
  expect(html).not.toContain("<dt>Amount</dt>");
  expect(html).toContain("&quot;value&quot;: &quot;40.00&quot;");
  expect(html).toContain("Approve and refund through PayPal");
  expect(html).toContain("JUDGE-SYNTHETIC-0-0");
  expect(html.match(/>Propose refund</g) ?? []).toHaveLength(1);
});
