"use client";

import type { Action } from "@niryat/shared";
import { useState } from "react";
import { approvalKind, approvalTitle } from "../lib/status";
import { ApprovalCard } from "./ApprovalCard";
import { EmptyState } from "./EmptyState";
import { CircleCheck } from "./icons";

export function OverviewApprovals({
  approvals,
}: {
  approvals: readonly (Action & { invoiceNumber: string })[];
}) {
  const [ids, setIds] = useState(
    approvals
      .filter((action) => action.status === "proposed")
      .slice(0, 3)
      .map((action) => action.id),
  );
  // Keep displayed cards mounted so their controls can announce and focus refreshed outcomes.
  const visible = approvals.filter((action) => ids.includes(action.id));
  visible.push(
    ...approvals
      .filter((action) => action.status === "proposed" && !ids.includes(action.id))
      .slice(0, 3 - visible.length),
  );
  if (visible.some((action) => !ids.includes(action.id)))
    setIds(visible.map((action) => action.id));

  return (
    <>
      {visible.length > 0 ? (
        visible.map((action) => {
          const kind = approvalKind(action);
          return (
            <ApprovalCard
              key={action.id}
              action={action}
              title={approvalTitle({ action, invoiceNumber: action.invoiceNumber })}
              {...(kind ? { kind } : {})}
            />
          );
        })
      ) : (
        <EmptyState icon={CircleCheck} title="Nothing to approve">
          Invoice sends, refunds and PayPal reminders wait here for your approval.
        </EmptyState>
      )}
    </>
  );
}
