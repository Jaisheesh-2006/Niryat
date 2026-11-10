"use client";

import type { CaDashboard as CaDashboardData } from "@niryat/shared";
import { useMemo } from "react";
import {
  CA_DASHBOARD_PROMPT_STARTERS,
  caDashboardInitialState,
  caDashboardSources,
} from "../lib/ca-dashboard";
import { StudioDashboard } from "./Dashboard";

export function CaDashboard({
  dashboard,
  licenseKey,
}: {
  dashboard: CaDashboardData;
  licenseKey: string | undefined;
}) {
  const data = useMemo(() => caDashboardSources(dashboard), [dashboard]);
  const defaults = useMemo(
    () => caDashboardInitialState(dashboard.financialYear),
    [dashboard.financialYear],
  );
  return (
    <StudioDashboard
      kind="ca"
      data={data}
      defaults={defaults}
      promptStarters={CA_DASHBOARD_PROMPT_STARTERS}
      licenseKey={licenseKey}
    />
  );
}
