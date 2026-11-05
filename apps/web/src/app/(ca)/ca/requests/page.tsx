import { caRequestsSchema, sessionUserSchema } from "@niryat/shared";
import { CaInvitationForm } from "../../../../components/CaInvitationForm";
import { CaRequestButtons } from "../../../../components/CaRequestButtons";
import { PageHeader } from "../../../../components/PageHeader";
import { apiGet } from "../../../../lib/api";
import { formatDate } from "../../../../lib/format";

export const metadata = { title: "Client requests" };

export default async function CaRequests() {
  const [requests, me] = await Promise.all([
    apiGet("/ca/requests", caRequestsSchema, "/ca/login"),
    apiGet("/auth/me", sessionUserSchema, "/ca/login"),
  ]);
  if (requests === null || me === null) throw new Error("CA requests unavailable");
  return (
    <>
      <PageHeader title="Client requests" />
      <CaInvitationForm />
      {requests.length === 0 ? (
        <p>
          No requests. Ask your client to add your email ({me.email}) in Niryat under Profile → Your
          CA.
        </p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li className="card" key={request.id}>
              <h2>{request.freelancerName ?? request.freelancerEmail}</h2>
              {request.freelancerName && <p>{request.freelancerEmail}</p>}
              <p>
                Requested <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
              </p>
              <CaRequestButtons requestId={request.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
