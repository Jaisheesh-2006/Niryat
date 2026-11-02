import { dashboardSchema } from "@niryat/shared";
import { z } from "zod";
import { Dashboard as DashboardView } from "../../../components/Dashboard";
import { EmptyState } from "../../../components/EmptyState";
import { ChartColumn } from "../../../components/icons";
import { PageHeader } from "../../../components/PageHeader";
import { apiGet } from "../../../lib/api";
import { DASHBOARD_EMPTY } from "../../../lib/dashboard";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const dashboard = await apiGet("/dashboard", dashboardSchema);
  // U6: AG Studio licence keys are browser-visible by design; absent means the trial watermark.
  const licenseKey = z
    .string()
    .optional()
    .parse(process.env.AG_STUDIO_LICENSE_KEY || undefined);
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Ask Claude a question in plain English, or explore the widgets. Figures come from your PayPal records."
      />
      {/* Payments are listed through invoices, so no invoices means no data at all. */}
      {dashboard?.invoices.length ? (
        <div className="card">
          <DashboardView dashboard={dashboard} licenseKey={licenseKey} />
        </div>
      ) : (
        <EmptyState icon={ChartColumn} title="Nothing to chart yet">
          {DASHBOARD_EMPTY}
        </EmptyState>
      )}
    </>
  );
}
