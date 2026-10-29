import { firaDocumentSchema } from "@niryat/shared";
import { z } from "zod";
import { FiraLineButtons } from "../../components/FiraLineButtons";
import { FiraUpload } from "../../components/FiraUpload";
import { apiGet } from "../../lib/api";

export default async function Fira() {
  const documents = (await apiGet("/fira", z.array(firaDocumentSchema))) ?? [];

  return (
    <>
      <h1>FIRA matching</h1>
      <p>
        Upload the digital FIRA PDF from PayPal. Niryat reads each line and matches it to your
        PayPal payments. Uncertain matches wait for your confirmation.
      </p>
      <FiraUpload />
      {documents.map((document) => (
        <section key={document.id}>
          <h2>
            FIRA for{" "}
            {new Date(document.month).toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
              timeZone: "Asia/Kolkata",
            })}
          </h2>
          <p>
            Uploaded{" "}
            {new Date(document.uploadedAt).toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata",
            })}
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Amount</th>
                <th scope="col">Reference</th>
                <th scope="col">Purpose code</th>
                <th scope="col">Match</th>
                <th scope="col">Confidence</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {document.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.date}</td>
                  <td>
                    {line.currency} {line.amount}
                  </td>
                  <td>
                    {line.reference}
                    <details>
                      <summary>Source text</summary>
                      <pre>{line.sourceText}</pre>
                    </details>
                  </td>
                  <td>{line.purposeCode ?? "Not shown"}</td>
                  <td>
                    {line.match ? (
                      <>
                        Payment {line.match.paypalTxnId} (invoice {line.match.invoiceNumber})
                        {line.match.state === "needs_confirmation" && <p>{line.note}</p>}
                      </>
                    ) : (
                      <>
                        <strong>Flagged</strong> {line.note}
                      </>
                    )}
                  </td>
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
        </section>
      ))}
    </>
  );
}
