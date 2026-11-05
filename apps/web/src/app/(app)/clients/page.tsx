import { clientSchema } from "@niryat/shared";
import { z } from "zod";
import { ClientForm } from "../../../components/ClientForm";
import { PageHeader } from "../../../components/PageHeader";
import { StatusBadge } from "../../../components/StatusBadge";
import { Term } from "../../../components/Term";
import { apiGet } from "../../../lib/api";
import type { Tone } from "../../../lib/status";

export const metadata = { title: "Clients" };

export default async function Clients() {
  const clients = (await apiGet("/clients", z.array(clientSchema))) ?? [];
  const regions = new Intl.DisplayNames(["en"], { type: "region" });
  const conditionLabels = {
    supplier_in_india: "Supplier in India",
    recipient_outside_india: "Client outside India",
    place_of_supply_outside_india: "Place of supply outside India",
    foreign_exchange: "Paid in foreign exchange",
    not_same_person: "Not your own establishment",
  };
  const resultLabels = { pass: "Pass", fail: "Fail", unknown: "Unknown" };

  const resultTones: Record<keyof typeof resultLabels, Tone> = {
    pass: "success",
    fail: "danger",
    unknown: "attention",
  };

  return (
    <>
      <PageHeader
        title="Clients and export check"
        description={<Term term="export_conditions" />}
        actions={
          <details className="card" open={clients.length === 0}>
            <summary>Add a client</summary>
            <ClientForm />
          </details>
        }
      />
      {clients.map((client) => {
        const { eligible, conditions, citation } = client.exportCheck.result;
        const countryName = regions.of(client.country) ?? client.country;
        return (
          <section className="card" key={client.id}>
            <h2>
              {client.name} ({countryName})
            </h2>
            <dl>
              <dt>Client email</dt>
              <dd>{client.email ?? "Not provided"}</dd>
              <dt>Client address</dt>
              <dd>{client.address ?? "Not provided"}</dd>
            </dl>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Condition</th>
                    <th scope="col">Result</th>
                    <th scope="col">Legal reference</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {conditions.map(({ id, status, reference, message }) => (
                    <tr key={id}>
                      <td>{conditionLabels[id]}</td>
                      <td>
                        <StatusBadge tone={resultTones[status]}>{resultLabels[status]}</StatusBadge>
                      </td>
                      <td>{reference}</td>
                      <td>{message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {eligible ? (
              <p>
                <strong>Export invoice with zero GST: allowed.</strong>
              </p>
            ) : (
              <>
                <p>
                  <strong>
                    Export invoice with zero GST: blocked. Check the reasons below with your CA.
                  </strong>
                </p>
                <ul>
                  {conditions
                    .filter(({ status }) => status !== "pass")
                    .map(({ id, message }) => (
                      <li key={id}>{message}</li>
                    ))}
                </ul>
              </>
            )}
            <p>
              Rule {citation.ruleId}: {citation.source}. <em>Verify with your CA.</em>
            </p>
            <details>
              <summary>Edit answers</summary>
              <ClientForm client={client} />
            </details>
          </section>
        );
      })}
    </>
  );
}
