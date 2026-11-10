import type { AgReportState } from "ag-studio";
import { z } from "zod";

type LayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// AG Studio validates the full state itself (onErrorRaised); this only rejects foreign or broken JSON.
const savedLayout = z.custom<AgReportState>(
  (value) =>
    z
      .object({ pages: z.array(z.object({ id: z.string() })).min(1), selectedPageId: z.string() })
      .safeParse(value).success,
);

/**
 * shortcut: layouts persist per browser and per dashboard kind, not per account; store them through
 * the API if users need their layout on another device.
 * The key carries a hash of the default layout, so a changed default retires layouts saved from it.
 */
export function layoutKey(kind: "freelancer" | "ca", defaults: AgReportState): string {
  let hash = 0;
  for (const char of JSON.stringify(defaults))
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return `niryat.dashboard.${kind}.${(hash >>> 0).toString(36)}`;
}

// Storage can be missing or throw (private windows, blocked site data); the default layout still works.
export function readLayout(storage: LayoutStorage | undefined, key: string) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return undefined;
    const parsed = savedLayout.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeLayout(
  storage: LayoutStorage | undefined,
  key: string,
  state: AgReportState | undefined,
) {
  try {
    if (state) storage?.setItem(key, JSON.stringify(state));
    else storage?.removeItem(key);
  } catch {
    console.error("Dashboard layout could not be saved in this browser");
  }
}
