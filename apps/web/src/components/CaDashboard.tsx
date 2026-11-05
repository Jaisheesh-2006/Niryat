"use client";

import type { CaDashboard as CaDashboardData } from "@niryat/shared";
import { type AgAiHarnessSetup, createAiHarness } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  CA_DASHBOARD_PROMPT_STARTERS,
  caDashboardInitialState,
  caDashboardSources,
} from "../lib/ca-dashboard";
import { createDashboardAdapter } from "../lib/dashboard-adapter";
import { modules, theme } from "./Dashboard";

const ai: AgAiHarnessSetup = ({ api }) =>
  createAiHarness(api, {
    adapter: createDashboardAdapter(fetch),
    promptStarters: CA_DASHBOARD_PROMPT_STARTERS,
  });

export function CaDashboard({
  dashboard,
  licenseKey,
}: {
  dashboard: CaDashboardData;
  licenseKey: string | undefined;
}) {
  return (
    <AgStudioProvider modules={modules} {...(licenseKey === undefined ? {} : { licenseKey })}>
      <div className="dashboard-studio">
        <AgStudio
          mode="edit"
          data={caDashboardSources(dashboard)}
          initialState={caDashboardInitialState(dashboard.financialYear)}
          theme={theme}
          ai={ai}
        />
      </div>
    </AgStudioProvider>
  );
}
