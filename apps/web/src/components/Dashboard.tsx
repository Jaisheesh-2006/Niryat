"use client";

import type { Dashboard as DashboardData } from "@niryat/shared";
import { type AgAiHarnessSetup, AgStudioAiModule, createAiHarness, studioTheme } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { dashboardInitialState, dashboardSources } from "../lib/dashboard";
import { createDashboardAdapter, DASHBOARD_PROMPT_STARTERS } from "../lib/dashboard-adapter";

// The theme reads the Neel tokens in globals.css (light only).
export const theme = studioTheme.withParams({
  accentColor: "var(--niryat-primary)",
  backgroundColor: "var(--niryat-surface)",
  foregroundColor: "var(--niryat-text)",
  chartAxisLineColor: "var(--niryat-muted)",
  fontFamily: "var(--niryat-font-sans), system-ui, sans-serif",
  chartPaletteFills1Color: "var(--niryat-primary)",
  chartPaletteFills2Color: "var(--niryat-cat-paypal)",
  chartPaletteFills3Color: "var(--niryat-neutral-strong)",
  chartPaletteFills4Color: "var(--niryat-danger)",
  chartPaletteStrokes1Color: "var(--niryat-primary)",
  chartPaletteStrokes2Color: "var(--niryat-cat-paypal)",
  chartPaletteStrokes3Color: "var(--niryat-neutral-strong)",
  chartPaletteStrokes4Color: "var(--niryat-danger)",
});
export const modules = [AgStudioAiModule];
// Module-level so a re-render keeps the same harness setup.
const ai: AgAiHarnessSetup = ({ api }) =>
  createAiHarness(api, {
    adapter: createDashboardAdapter(fetch),
    promptStarters: DASHBOARD_PROMPT_STARTERS,
  });

export function Dashboard({
  dashboard,
  licenseKey,
}: {
  dashboard: DashboardData;
  licenseKey: string | undefined;
}) {
  return (
    <AgStudioProvider modules={modules} {...(licenseKey === undefined ? {} : { licenseKey })}>
      <div className="dashboard-studio">
        <AgStudio
          mode="edit"
          data={dashboardSources(dashboard)}
          initialState={dashboardInitialState}
          theme={theme}
          ai={ai}
        />
      </div>
    </AgStudioProvider>
  );
}
