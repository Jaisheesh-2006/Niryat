import { syncStatusSchema } from "@niryat/shared";
import { apiGet } from "../lib/api";
import { formatDateTime, formatRelativeTime } from "../lib/format";

export async function SyncFreshness() {
  const status = await apiGet("/sync-status", syncStatusSchema);
  if (!status)
    return (
      <p role="status" className="sync-status" data-state="stale">
        PayPal data freshness is unavailable. New payments or disputes may not show yet.
      </p>
    );
  const time = status.lastSuccessAt;
  return (
    <div
      role="status"
      className="sync-status"
      data-state={status.stale || status.lastStatus === "failed" ? "stale" : "fresh"}
    >
      {status.stale ? (
        <p>
          PayPal data may be out of date (last update{" "}
          {time ? <time dateTime={time}>{formatDateTime(time)}</time> : "never"}). New payments or
          disputes may not show yet.
        </p>
      ) : (
        <p>
          PayPal data last updated{" "}
          {time && (
            <time dateTime={time} title={formatDateTime(time)}>
              {formatRelativeTime(time, new Date())}
            </time>
          )}
          .
        </p>
      )}
      {status.lastStatus === "failed" && (
        <p>The latest PayPal sync failed. The last successful update is shown above.</p>
      )}
    </div>
  );
}
