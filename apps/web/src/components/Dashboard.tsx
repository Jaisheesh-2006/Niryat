"use client";

import type { Dashboard as DashboardData } from "@niryat/shared";
import { studioTheme } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { dashboardInitialState, dashboardSources } from "../lib/dashboard";

// D12 tokens switch for dark mode in globals.css, so the theme follows them.
const theme = studioTheme.withParams({
  accentColor: "var(--niryat-primary)",
  chartAxisLineColor: "var(--niryat-past)",
});

export function Dashboard({
  dashboard,
  licenseKey,
}: {
  dashboard: DashboardData;
  licenseKey: string | undefined;
}) {
  return (
    <AgStudioProvider {...(licenseKey === undefined ? {} : { licenseKey })}>
      <div className="dashboard-studio">
        <AgStudio
          data={dashboardSources(dashboard)}
          initialState={dashboardInitialState}
          theme={theme}
        />
      </div>
    </AgStudioProvider>
  );
}
