import { dashboardSchema } from "@niryat/shared";
import { z } from "zod";
import { Dashboard as DashboardView } from "../../components/Dashboard";
import { apiGet } from "../../lib/api";
import { DASHBOARD_EMPTY } from "../../lib/dashboard";

export default async function Dashboard() {
  const dashboard = await apiGet("/dashboard", dashboardSchema);
  // U6: AG Studio licence keys are browser-visible by design; absent means the trial watermark.
  const licenseKey = z
    .string()
    .optional()
    .parse(process.env.AG_STUDIO_LICENSE_KEY || undefined);
  return (
    <>
      <h1>Dashboard</h1>
      {/* Payments are listed through invoices, so no invoices means no data at all. */}
      {dashboard?.invoices.length ? (
        <DashboardView dashboard={dashboard} licenseKey={licenseKey} />
      ) : (
        <p>{DASHBOARD_EMPTY}</p>
      )}
    </>
  );
}
