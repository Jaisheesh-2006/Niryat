import { afterEach, expect, it, vi } from "vitest";
import { SidebarResize } from "./SidebarResize";

const state = vi.hoisted(() => ({ width: 264 }));
vi.mock("react", () => ({
  useState: () => [
    state.width,
    (width: number) => {
      state.width = width;
    },
  ],
}));
afterEach(() => {
  state.width = 264;
});

function handle() {
  return {
    parentElement: {
      style: { setProperty: vi.fn() },
      getBoundingClientRect: () => ({ left: 10 }),
    },
    focus: vi.fn(),
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => false),
    releasePointerCapture: vi.fn(),
  };
}

it("resizes only while dragging, clamps the width and releases the pointer", () => {
  const currentTarget = handle();
  const props = SidebarResize().props;
  const event = { currentTarget, pointerId: 1, button: 0, preventDefault: vi.fn() };
  props.onPointerDown({ ...event, button: 2 });
  expect(currentTarget.setPointerCapture).not.toHaveBeenCalled();
  props.onPointerMove({ ...event, clientX: 300 });
  expect(currentTarget.parentElement.style.setProperty).not.toHaveBeenCalled();
  props.onPointerDown(event);
  expect(currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  expect(currentTarget.focus).toHaveBeenCalledOnce();
  currentTarget.hasPointerCapture.mockReturnValue(true);
  for (const [clientX, expected] of [
    [300, 290],
    [100, 224],
    [900, 384],
  ]) {
    props.onPointerMove({ ...event, clientX });
    expect(currentTarget.parentElement.style.setProperty).toHaveBeenLastCalledWith(
      "--niryat-sidebar-width",
      `${expected}px`,
    );
    expect(SidebarResize().props["aria-valuenow"]).toBe(expected);
  }
  props.onPointerUp(event);
  expect(currentTarget.releasePointerCapture).toHaveBeenCalledWith(1);
});

it("supports keyboard resizing and exposes the current value", () => {
  const currentTarget = handle();
  const preventDefault = vi.fn();
  for (const [key, expected] of [
    ["ArrowRight", 280],
    ["ArrowLeft", 264],
    ["Home", 224],
    ["ArrowLeft", 224],
    ["End", 384],
    ["ArrowRight", 384],
  ] as const) {
    SidebarResize().props.onKeyDown({ key, currentTarget, preventDefault });
    const props = SidebarResize().props;
    expect(props["aria-valuenow"]).toBe(expected);
    expect(props["aria-valuemin"]).toBe(224);
    expect(props["aria-valuemax"]).toBe(384);
    expect(props["aria-controls"]).toBe("nav-menu");
  }
  expect(preventDefault).toHaveBeenCalledTimes(6);
  SidebarResize().props.onKeyDown({ key: "Tab", currentTarget, preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(6);
});
