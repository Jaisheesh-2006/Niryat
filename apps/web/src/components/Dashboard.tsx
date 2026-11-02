"use client";

import type { Dashboard as DashboardData } from "@niryat/shared";
import { type AgAiHarnessSetup, AgStudioAiModule, createAiHarness, studioTheme } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { dashboardInitialState, dashboardSources } from "../lib/dashboard";
import { createDashboardAdapter, DASHBOARD_PROMPT_STARTERS } from "../lib/dashboard-adapter";

// D12 tokens switch for dark mode in globals.css, so the theme follows them.
const theme = studioTheme.withParams({
  accentColor: "var(--niryat-primary)",
  backgroundColor: "var(--niryat-surface)",
  foregroundColor: "var(--niryat-text)",
  chartAxisLineColor: "var(--niryat-muted)",
  fontFamily: "var(--niryat-font-sans), system-ui, sans-serif",
  chartPaletteFills1Color: "var(--niryat-primary)",
  chartPaletteFills2Color: "var(--niryat-accent)",
  chartPaletteFills3Color: "var(--niryat-neutral-strong)",
  chartPaletteFills4Color: "var(--niryat-danger)",
  chartPaletteStrokes1Color: "var(--niryat-primary)",
  chartPaletteStrokes2Color: "var(--niryat-accent)",
  chartPaletteStrokes3Color: "var(--niryat-neutral-strong)",
  chartPaletteStrokes4Color: "var(--niryat-danger)",
});
const modules = [AgStudioAiModule];
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
