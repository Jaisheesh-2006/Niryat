import { firaDocumentSchema } from "@niryat/shared";
import { z } from "zod";
import { FiraLineButtons } from "../../../components/FiraLineButtons";
import { FiraUpload } from "../../../components/FiraUpload";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { Term } from "../../../components/Term";
import { apiGet } from "../../../lib/api";
import { formatDate, formatMoney, formatMonth } from "../../../lib/format";

export const metadata = { title: "FIRA" };

export default async function Fira() {
  const documents = (await apiGet("/fira", z.array(firaDocumentSchema))) ?? [];

  return (
    <>
      <PageHeader
        title="Payment proof"
        description="Upload your payment proof and match each line to your PayPal payments; confirm any uncertain matches."
      />
      <div className="terms">
        <p>
          <Term term="fira" />
        </p>
        <p>
          <Term term="purpose_code" />
        </p>
      </div>
      <FiraUpload />
      {documents.map((document) => (
        <section className="card" key={document.id}>
          <h2>FIRA for {formatMonth(document.month)}</h2>
          <p className="caption">Uploaded {formatDate(document.uploadedAt)}</p>
          <div className="table-wrap">
            <table className="fira-lines">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Purpose code</th>
                  <th scope="col">Match</th>
                  <th scope="col">State</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {document.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{formatDate(line.date)}</td>
                    <td className="num">{formatMoney(line.amount, line.currency)}</td>
                    <td>
                      <span className="mono">{line.reference}</span>
                      <details>
                        <summary>Source text</summary>
                        <pre>{line.sourceText}</pre>
                      </details>
                    </td>
                    <td className="mono">{line.purposeCode ?? "Not shown"}</td>
                    <td>
                      {line.match ? (
                        <>
                          Payment <span className="mono">{line.match.paypalTxnId}</span> (invoice{" "}
                          <span className="mono">{line.match.invoiceNumber}</span>)
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          !line.match
                            ? "danger"
                            : line.match.state === "matched"
                              ? "success"
                              : "attention"
                        }
                      >
                        {!line.match
                          ? "Flagged"
                          : line.match.state === "matched"
                            ? "Matched"
                            : "Needs your confirmation"}
                      </StatusBadge>
                    </td>
                    <td>{line.note}</td>
                    <td>
                      {line.match ? `${Math.round(Number(line.match.confidence) * 100)}%` : "—"}
                    </td>
                    <td>
                      {line.match?.state === "needs_confirmation" && (
                        <FiraLineButtons lineId={line.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
