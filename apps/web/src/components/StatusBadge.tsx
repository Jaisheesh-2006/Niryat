import type { ReactNode } from "react";
import type { Tone } from "../lib/status";

export function StatusBadge({
  tone,
  children,
  busy,
}: {
  tone: Tone;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <span className="badge" data-tone={tone} aria-busy={busy || undefined}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </span>
  );
}
