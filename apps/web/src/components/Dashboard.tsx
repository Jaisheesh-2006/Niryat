"use client";

import type { Dashboard as DashboardData } from "@niryat/shared";
import {
  type AgAiHarnessSetup,
  type AgAiPromptStarter,
  type AgDataSourcesDefinition,
  type AgReportState,
  AgStudioAiModule,
  createAiHarness,
  directLlmRunner,
  studioTheme,
} from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { useEffect, useMemo, useState } from "react";
import { dashboardInitialState, dashboardSources } from "../lib/dashboard";
import { createDashboardAdapter, DASHBOARD_PROMPT_STARTERS } from "../lib/dashboard-adapter";
import { layoutKey, readLayout, writeLayout } from "../lib/dashboard-layout";
import { glossary, type TermId } from "../lib/glossary";

// The theme reads the Neel tokens in globals.css (light only).
export const theme = studioTheme.withParams({
  accentColor: "var(--niryat-primary)",
  backgroundColor: "var(--niryat-surface)",
  foregroundColor: "var(--niryat-text)",
  chartAxisLineColor: "var(--niryat-muted)",
  fontFamily: "var(--niryat-font-sans), system-ui, sans-serif",
  fontSize: 14,
  borderColor: "var(--niryat-border)",
  borderRadius: "var(--niryat-radius-control)",
  studioWrapperBorder: false,
  studioWidgetBorderRadius: "var(--niryat-radius-card)",
  studioWidgetPadding: "var(--niryat-space-4)",
  studioWidgetTitleFontSize: 16,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: "var(--niryat-text)",
  studioPanelHeaderFontSize: 14,
  chartPaletteFills1Color: "var(--niryat-primary)",
  chartPaletteFills2Color: "var(--niryat-cat-paypal)",
  chartPaletteFills3Color: "var(--niryat-neutral-strong)",
  chartPaletteFills4Color: "var(--niryat-danger)",
  chartPaletteStrokes1Color: "var(--niryat-primary)",
  chartPaletteStrokes2Color: "var(--niryat-cat-paypal)",
  chartPaletteStrokes3Color: "var(--niryat-neutral-strong)",
  chartPaletteStrokes4Color: "var(--niryat-danger)",
});
const modules = [AgStudioAiModule];
const TERM_IDS = Object.keys(glossary) as TermId[];

// AG's own five agents, all on Claude; the lead agent also explains Niryat's compliance terms.
function dashboardAi(promptStarters: AgAiPromptStarter[]): AgAiHarnessSetup {
  return ({ api }) => {
    const explainTerm = api.defineAiTool({
      name: "explain_term",
      description:
        "Explain an Indian export-compliance term used on this dashboard in plain English, and who handles it.",
      params: (s) => s.object({ term: s.enum(TERM_IDS) }),
      execute: ({ term }: { term: TermId }, ctx) => {
        const entry = glossary[term];
        return ctx.success(`${entry.term}: ${entry.plain} Who handles it: ${entry.who}.`);
      },
    });
    const adapter = createDashboardAdapter(fetch);
    return createAiHarness(api, ({ builtIn }) => ({
      agents: Object.values(builtIn).map((agent) =>
        directLlmRunner(
          agent.id === "lead"
            ? {
                ...agent,
                adapter,
                instructions: (context, params) =>
                  `${agent.instructions?.(context, params) ?? ""}\nWhen the user asks what a compliance term means (LUT, FIRA, GSTR-1, RBI purpose code, realisation, SAC and similar), call explain_term and answer from its result in plain words.`,
                tools: (context, params) => [
                  ...(agent.tools?.(context, params) ?? []),
                  explainTerm,
                ],
              }
            : { ...agent, adapter },
        ),
      ),
      primary: "lead",
      promptStarters,
    }));
  };
}

export function StudioDashboard({
  kind,
  data,
  defaults,
  promptStarters,
  licenseKey,
}: {
  kind: "freelancer" | "ca";
  data: AgDataSourcesDefinition;
  defaults: AgReportState;
  promptStarters: AgAiPromptStarter[];
  licenseKey: string | undefined;
}) {
  const key = useMemo(() => layoutKey(kind, defaults), [kind, defaults]);
  const ai = useMemo(() => dashboardAi(promptStarters), [promptStarters]);
  // Studio reads its state once, so it mounts only after the browser-only saved layout is read.
  const [start, setStart] = useState<{ state: AgReportState; saved: boolean; run: number }>();
  useEffect(() => {
    const saved = readLayout(globalThis.localStorage, key);
    setStart((current) => ({ state: saved ?? defaults, saved: !!saved, run: current?.run ?? 0 }));
  }, [key, defaults]);
  function reset() {
    writeLayout(globalThis.localStorage, key, undefined);
    setStart((current) => ({ state: defaults, saved: false, run: (current?.run ?? 0) + 1 }));
  }
  return (
    <AgStudioProvider modules={modules} {...(licenseKey === undefined ? {} : { licenseKey })}>
      <div className="dashboard-toolbar">
        <p>Changes you or Claude make to this dashboard are saved in this browser.</p>
        <button type="button" className="btn" data-variant="secondary" onClick={reset}>
          Reset layout
        </button>
      </div>
      <div className="dashboard-studio">
        {start && (
          <AgStudio
            key={start.run}
            mode="edit"
            data={data}
            initialState={start.state}
            theme={theme}
            ai={ai}
            onStateUpdated={(event) => writeLayout(globalThis.localStorage, key, event.state)}
            onErrorRaised={(event) => {
              console.error("AG Studio configuration error", event.errorType, event.errorDetails);
              // A saved layout Studio cannot load falls back to the default instead of a broken page.
              if (event.fatal && start.saved) reset();
            }}
          />
        )}
      </div>
    </AgStudioProvider>
  );
}

export function Dashboard({
  dashboard,
  licenseKey,
}: {
  dashboard: DashboardData;
  licenseKey: string | undefined;
}) {
  const data = useMemo(() => dashboardSources(dashboard), [dashboard]);
  return (
    <StudioDashboard
      kind="freelancer"
      data={data}
      defaults={dashboardInitialState}
      promptStarters={DASHBOARD_PROMPT_STARTERS}
      licenseKey={licenseKey}
    />
  );
}
