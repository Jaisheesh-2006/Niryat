import { healthReportSchema } from "@niryat/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { apiGet } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import type { Tone } from "../../../lib/status";

export const metadata = { title: "Health check" };

export default async function HealthCheck() {
  const report = await apiGet("/health-check", healthReportSchema);
  if (!report) redirect("/profile");
  const { score, checkedOn, flags, suggestion } = report;
  const severityLabels = { high: "High", medium: "Medium", low: "Low" };
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const severityTones: Record<keyof typeof severityLabels, Tone> = {
    high: "danger",
    medium: "attention",
    low: "neutral",
  };

  return (
    <>
      <PageHeader
        title="Compliance health check"
        actions={
          <Link className="btn" data-variant="secondary" href="/profile">
            Edit profile
          </Link>
        }
      />
      <section className="card">
        <p className="display">{score} / 100</p>
        <div className="health-bar" role="img" aria-label={`Health score ${score} out of 100`}>
          <div style={{ width: `${score}%` }} />
        </div>
        <p className="caption">Checked on {formatDate(checkedOn)}</p>
      </section>
      <h2>Red flags</h2>
      {flags.length === 0 ? (
        <p>No red flags found.</p>
      ) : (
        <div>
          {[...flags]
            .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
            .map(({ code, severity, message, citation, note }) => (
              <article className="card" key={code}>
                <StatusBadge tone={severityTones[severity]}>{severityLabels[severity]}</StatusBadge>
                <p>
                  <strong>{message}</strong>
                </p>
                <p className="caption">
                  Rule <span className="mono">{citation.ruleId}</span>: {citation.source}
                </p>
                <p className="caption">
                  <em>{note}</em>
                </p>
              </article>
            ))}
        </div>
      )}
      <h2>Purpose code</h2>
      {suggestion === null ? (
        <p>Describe your work in your profile to get a suggestion.</p>
      ) : (
        <>
          {suggestion.code === null ? (
            <p>No code suggested.</p>
          ) : (
            <p>
              Suggested code: <strong className="mono purpose-code">{suggestion.code}</strong> (
              {suggestion.label})
            </p>
          )}
          <p className="suggestion">{suggestion.reason}</p>
          <p className="caption">
            <em>{suggestion.note}</em>
          </p>
        </>
      )}
    </>
  );
}
