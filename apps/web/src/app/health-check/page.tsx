import { healthReportSchema } from "@niryat/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiGet } from "../../lib/api";

export default async function HealthCheck() {
  const report = await apiGet("/health-check", healthReportSchema);
  if (!report) redirect("/profile");
  const { score, checkedOn, flags, suggestion } = report;
  const severityLabels = { high: "High", medium: "Medium", low: "Low" };

  return (
    <>
      <h1>Compliance health check</h1>
      <p>
        Score: <strong>{score}</strong> / 100 (checked on {checkedOn})
      </p>
      <h2>Red flags</h2>
      {flags.length === 0 ? (
        <p>No red flags found.</p>
      ) : (
        <ul>
          {flags.map(({ code, severity, message, citation, note }) => (
            <li key={code}>
              <strong>{severityLabels[severity]}</strong>: {message}
              <br />
              Rule {citation.ruleId}: {citation.source}
              <br />
              <em>{note}</em>
            </li>
          ))}
        </ul>
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
              Suggested code: {suggestion.code} ({suggestion.label})
            </p>
          )}
          <p>{suggestion.reason}</p>
          <p>
            <em>{suggestion.note}</em>
          </p>
        </>
      )}
      <p>
        <Link href="/profile">Edit profile</Link>
      </p>
    </>
  );
}
