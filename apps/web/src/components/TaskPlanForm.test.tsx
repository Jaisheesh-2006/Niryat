import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { TaskPlanForm } from "./TaskPlanForm";

const { refresh, setMessage, pending } = vi.hoisted(() => ({
  refresh: vi.fn(),
  setMessage: vi.fn(),
  pending: [] as Promise<void>[],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => ["", setMessage],
  useTransition: () => [false, (action: () => Promise<void>) => pending.push(action())],
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  pending.length = 0;
});

it("resets only the date input when the saved plan is changed or cleared", () => {
  const keys = [];
  for (const plannedDate of [null, "2026-12-31", null]) {
    const element = TaskPlanForm({ taskId: "10000000-0000-4000-8000-000000000001", plannedDate });
    const input = Children.toArray(element.props.children).find(
      (child) => isValidElement(child) && child.type === "input",
    );
    if (!isValidElement<{ defaultValue: string }>(input)) throw new Error("Expected date input");
    expect(input.props.defaultValue).toBe(plannedDate ?? "");
    keys.push(input.key);
  }
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys[2]).toBe(keys[0]);
});

it.each([
  { date: "2026-12-31", ok: true },
  { date: "", ok: true },
  { date: "2026-02-30", ok: true },
  { date: "2026-12-31", ok: false },
])(
  "saves or clears $date with result $ok and reports invalid dates/failures",
  async ({ date, ok }) => {
    const id = "10000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      ok
        ? Response.json({
            id,
            type: "agent_suggestion",
            status: "open",
            message: "Check",
            dueDate: null,
            plannedDate: date || null,
            invoiceId: null,
            sourceRuleId: "TEST",
            createdAt: "2026-11-01T00:00:00Z",
            doneAt: null,
          })
        : Response.json({ error: "not_found" }, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal(
      "FormData",
      class extends FormData {
        constructor() {
          super();
          this.set("plannedDate", date);
        }
      },
    );
    const element = TaskPlanForm({ taskId: id, plannedDate: "2026-11-10" });
    const html = renderToStaticMarkup(element);
    expect(html).toContain(`for="plan-${id}"`);
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-11-10"');
    expect(html).toContain("Leave blank to clear. The due date stays unchanged.");
    if (
      !isValidElement<{
        onSubmit: (event: { preventDefault: () => void; currentTarget: object }) => void;
      }>(element)
    )
      throw new Error("Expected form");
    const preventDefault = vi.fn();
    element.props.onSubmit({ preventDefault, currentTarget: {} });
    await Promise.all(pending);
    expect(preventDefault).toHaveBeenCalledOnce();
    if (date === "2026-02-30") {
      expect(fetcher).not.toHaveBeenCalled();
      expect(setMessage).toHaveBeenLastCalledWith("Enter a valid planned date.");
      return;
    }
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/tasks/${id}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedDate: date || null }),
    });
    expect(refresh).toHaveBeenCalledTimes(ok ? 1 : 0);
    if (ok) expect(setMessage).toHaveBeenLastCalledWith("Planned date saved.");
    else expect(setMessage).toHaveBeenLastCalledWith("Not found. Refresh the page.");
  },
);
