import { healthReportSchema } from "@niryat/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { Term } from "../../../components/Term";
import { apiGet } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { healthSeverity } from "../../../lib/status";

export const metadata = { title: "Health check" };

export default async function HealthCheck() {
  const report = await apiGet("/health-check", healthReportSchema);
  if (!report) redirect("/profile");
  const { score, checkedOn, flags, suggestion } = report;

  return (
    <>
      <PageHeader
        title="Compliance health check"
        description="See what needs attention before you bill foreign clients, and what to do next."
        actions={
          <Link className="btn" data-variant="secondary" href="/profile">
            Edit profile
          </Link>
        }
      />
      <details>
        <summary>What these terms mean</summary>
        <p>
          <Term term="lut" />
        </p>
        <p>
          <Term term="gstin" />
        </p>
        <p>
          <Term term="purpose_code" />
        </p>
      </details>
      <section className="card">
        <p className="display">{score} / 100</p>
        <div className="health-bar" role="img" aria-label={`Health score ${score} out of 100`}>
          <div style={{ width: `${score}%` }} />
        </div>
        <p className="caption">Checked on {formatDate(checkedOn)}</p>
      </section>
      <h2>Checks needing attention</h2>
      {flags.length === 0 ? (
        <p>No issues found in these checks.</p>
      ) : (
        <div>
          {[...flags]
            .sort((a, b) => healthSeverity[a.severity].order - healthSeverity[b.severity].order)
            .map(({ code, severity, message, citation, note }) => (
              <article className="card" key={code}>
                <StatusBadge tone={healthSeverity[severity].tone}>
                  {healthSeverity[severity].label}
                </StatusBadge>
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
