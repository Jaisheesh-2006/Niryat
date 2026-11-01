import type { Action } from "@niryat/shared";
import type { ReactNode } from "react";
import { formatDate } from "../lib/format";
import { actionStatusLabel, actionTone } from "../lib/status";
import { ActionButtons } from "./ActionButtons";
import { StatusBadge } from "./StatusBadge";

export function ApprovalCard({
  action,
  title,
  kind,
  facts,
}: {
  action: Action;
  title: string;
  kind?: string;
  facts?: readonly { label: string; value: ReactNode }[];
}) {
  const compact = action.status === "done" || action.status === "rejected";
  return (
    <article className="card approval-card" data-status={action.status}>
      {!compact && (
        <div className="card-header">
          <StatusBadge tone={actionTone(action.status)} busy={action.status === "approved"}>
            {actionStatusLabel(action.status)}
          </StatusBadge>
          {kind && <span className="approval-kind">{kind}</span>}
        </div>
      )}
      <h3 key="title">{title}</h3>
      {compact && <time dateTime={action.createdAt}>{formatDate(action.createdAt)}</time>}
      {!compact && facts && facts.length > 0 && (
        <dl className="approval-facts">
          {facts.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Keep decision focus when the card collapses after a refresh. */}
      <ActionButtons key="controls" action={action} inCard />
    </article>
  );
}
