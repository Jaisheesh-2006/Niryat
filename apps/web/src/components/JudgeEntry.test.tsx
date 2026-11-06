import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { JudgeEntry } from "./JudgeEntry";

const state = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as (() => () => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
  useEffect: (effect: () => () => void) => {
    state.effects.push(effect);
  },
}));
afterEach(() => {
  state.values = [];
  state.cursor = 0;
  state.effects = [];
  vi.unstubAllGlobals();
});
function render() {
  state.cursor = 0;
  return JudgeEntry();
}
function buttons(tree: ReactElement | null) {
  if (!isValidElement<{ children: ReactNode }>(tree)) throw new Error("Expected demo entry");
  const actions = Children.toArray(tree.props.children).find(
    (child) =>
      isValidElement<{ className?: string }>(child) && child.props.className === "hero-actions",
  );
  if (!isValidElement<{ children: ReactElement[] }>(actions)) throw new Error("Expected actions");
  return Children.toArray(actions.props.children).filter(
    (child): child is ReactElement<{ disabled: boolean; onClick: () => Promise<void> }> =>
      isValidElement<{ disabled: boolean; onClick: () => Promise<void> }>(child) &&
      child.type === "button",
  );
}

it.each([false, true])(
  "shows the optional demo entry only after a validated enabled flag: %s",
  async (enabled) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ enabled }));
    vi.stubGlobal("fetch", fetcher);
    expect(render()).toBeNull();
    state.effects[0]?.();
    await vi.waitFor(() => expect(state.values[0]).toBe(enabled));
    expect(fetcher).toHaveBeenCalledWith("/api/judge-mode", { cache: "no-store" });
    if (!enabled) expect(render()).toBeNull();
    else {
      const html = renderToStaticMarkup(render());
      expect(html).toContain("Try as freelancer (demo)");
      expect(html).toContain("Try as CA (demo)");
      expect(html).toContain("Demo accounts use PayPal sandbox only. No real money moves.");
      expect(html).toContain("Shared demo accounts contain synthetic records.");
    }
  },
);

it.each([
  Response.json({ enabled: "true" }),
  Response.json({}, { status: 503 }),
  new Error("offline"),
])("hides entry for invalid or unavailable flags", async (response) => {
  const fetcher =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  render();
  state.effects[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(render()).toBeNull();
});

it.each(["freelancer", "ca"] as const)(
  "starts %s with JSON, disables both buttons and uses fresh role navigation",
  async (role) => {
    state.values = [true, false, ""];
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    const fetcher = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    const button = buttons(render())[role === "ca" ? 1 : 0];
    if (!button) throw new Error("Expected role button");
    const pending = button.props.onClick();
    expect(buttons(render()).every((button) => button.props.disabled)).toBe(true);
    await pending;
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/judge",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as: role }),
      }),
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith(role === "ca" ? "/ca" : "/overview");
  },
);

it("shows an accessible failure and permits retry without navigating", async () => {
  state.values = [true, false, ""];
  const replace = vi.fn();
  vi.stubGlobal("window", { location: { replace } });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "judge_unavailable" }, { status: 503 })),
  );
  await buttons(render())[0]?.props.onClick();
  expect(renderToStaticMarkup(render())).toContain('role="alert"');
  expect(renderToStaticMarkup(render())).toContain("Demo accounts are not ready.");
  expect(buttons(render()).every((button) => !button.props.disabled)).toBe(true);
  expect(replace).not.toHaveBeenCalled();
});
