import { EmptyState } from "../../../components/EmptyState";
import { Users } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";

export const metadata = { title: "CA clients" };

export default function CaClients() {
  return (
    <>
      <PageHeader title="Clients" description="View records shared by your freelancer clients." />
      <EmptyState icon={Users} title="Review your client requests">
        <a href="/ca/requests">Accept or decline requests</a> from your freelancer clients. Viewing
        shared records is coming next.
      </EmptyState>
    </>
  );
}
