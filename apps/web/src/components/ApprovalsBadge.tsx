import { closePageSchema } from "@niryat/shared";
import { apiGet } from "../lib/api";

export async function ApprovalsBadge() {
  const close = await apiGet("/close", closePageSchema);
  const count = close?.approvals.filter((action) => action.status === "proposed").length ?? 0;
  if (count === 0) return null;
  return (
    <span className="nav-count">
      <span aria-hidden="true">{count}</span>
      <span className="visually-hidden">
        {count} {count === 1 ? "approval waiting" : "approvals waiting"}
      </span>
    </span>
  );
}
