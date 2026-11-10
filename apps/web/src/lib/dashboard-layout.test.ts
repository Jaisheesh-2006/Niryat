import { afterEach, expect, it, vi } from "vitest";
import { dashboardInitialState } from "./dashboard";
import { layoutKey, readLayout, writeLayout } from "./dashboard-layout";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

afterEach(() => vi.restoreAllMocks());

it("keys layouts by dashboard kind and retires them when the default layout changes", () => {
  const key = layoutKey("freelancer", dashboardInitialState);
  expect(key).toMatch(/^niryat\.dashboard\.freelancer\.[0-9a-z]+$/);
  expect(layoutKey("freelancer", dashboardInitialState)).toBe(key);
  expect(layoutKey("ca", dashboardInitialState)).not.toBe(key);
  expect(layoutKey("freelancer", { ...dashboardInitialState, selectedPageId: "other" })).not.toBe(
    key,
  );
});

it("saves, restores and clears a layout", () => {
  const storage = memoryStorage();
  writeLayout(storage, "k", dashboardInitialState);
  expect(readLayout(storage, "k")).toEqual(dashboardInitialState);
  writeLayout(storage, "k", undefined);
  expect(storage.items.size).toBe(0);
  expect(readLayout(storage, "k")).toBeUndefined();
});

it("ignores broken or foreign saved values and missing storage", () => {
  const storage = memoryStorage();
  for (const raw of ["not json", "null", "{}", '{"pages":[],"selectedPageId":"x"}']) {
    storage.items.set("k", raw);
    expect(readLayout(storage, "k")).toBeUndefined();
  }
  expect(readLayout(undefined, "k")).toBeUndefined();
});

it("keeps working when the browser refuses storage", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const refusing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {},
  };
  expect(readLayout(refusing, "k")).toBeUndefined();
  writeLayout(refusing, "k", dashboardInitialState);
  expect(error).toHaveBeenCalledExactlyOnceWith(
    "Dashboard layout could not be saved in this browser",
  );
});
