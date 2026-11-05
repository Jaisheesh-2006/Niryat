import { EmptyState } from "../../../components/EmptyState";
import { Users } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";

export const metadata = { title: "CA clients" };

export default function CaClients() {
  return (
    <>
      <PageHeader title="Clients" description="View records shared by your freelancer clients." />
      <EmptyState icon={Users} title="Client sharing is not available yet">
        Your CA account is ready. Client requests and shared records are coming next.
      </EmptyState>
    </>
  );
}
