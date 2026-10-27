import { clientSchema } from "@niryat/shared";
import { z } from "zod";
import { ClientForm } from "../../components/ClientForm";
import { apiGet } from "../../lib/api";

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

  return (
    <>
      <h1>Clients and export check</h1>
      <h2>Add a client</h2>
      <ClientForm />
      {clients.map((client) => {
        const { eligible, conditions, citation } = client.exportCheck.result;
        const countryName = regions.of(client.country) ?? client.country;
        return (
          <section key={client.id}>
            <h2>
              {client.name} ({countryName})
            </h2>
            <dl>
              <dt>Client email</dt>
              <dd>{client.email ?? "Not provided"}</dd>
              <dt>Client address</dt>
              <dd>{client.address ?? "Not provided"}</dd>
            </dl>
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
                    <td>{resultLabels[status]}</td>
                    <td>{reference}</td>
                    <td>{message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {eligible ? (
              <p>
                <strong>Zero-rated export invoice: allowed.</strong>
              </p>
            ) : (
              <>
                <p>
                  <strong>Zero-rated export invoice: blocked.</strong>
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
