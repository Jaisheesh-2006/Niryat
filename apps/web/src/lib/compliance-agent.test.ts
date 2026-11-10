import type { AgAiAgentContext } from "ag-studio";
import { describe, expect, it } from "vitest";
import { COMPLIANCE_AGENT_ID, complianceAgent, LEAD_DELEGATES } from "./compliance-agent";

// Each Studio/harness tool factory returns a stub named after the call, so the listing can be read.
const named = (prefix: string) =>
  new Proxy(
    {},
    {
      get: (_target, key) => (arg?: unknown) => ({
        name: `${prefix}${String(key)}${Array.isArray(arg) ? `:${arg.join(",")}` : ""}`,
      }),
    },
  );
const context = {
  api: {},
  studio: named(""),
  tools: named(""),
} as unknown as AgAiAgentContext;

describe("compliance reviewer agent", () => {
  it("only reads and delegates to Studio's own Page and Widget agents", () => {
    const agent = complianceAgent("freelancer");
    expect(agent.tools?.(context, undefined).map((tool) => tool.name)).toEqual([
      "viewSchema",
      "viewPage",
      "executeQuery",
      "delegateTo:page,widget",
    ]);
    expect(agent.defaultToolCalls?.(context, undefined)).toEqual([
      { tool: "view_schema" },
      { tool: "view_page" },
    ]);
    expect(agent.maxTurns).toBe(12);
  });

  it("is reachable from the lead next to AG's own delegates", () => {
    expect(LEAD_DELEGATES).toEqual(["data", "widget", "page", "planning", COMPLIANCE_AGENT_ID]);
  });

  it("uses rules-computed flags, no thresholds of its own, and keeps CA freelancers separate", () => {
    const freelancer = complianceAgent("freelancer").instructions?.(context, undefined) ?? "";
    const ca = complianceAgent("ca").instructions?.(context, undefined) ?? "";
    for (const text of [freelancer, ca]) {
      expect(text).toMatch(/Never state amounts, counts, dates or other figures/);
      expect(text).toMatch(/never recompute them/);
      expect(text).not.toMatch(/\d{2,}/);
    }
    expect(freelancer).toMatch(/rbi-runway widget/);
    expect(ca).toMatch(/Group every check by Freelancer \(freelancerId\)/);
    expect(freelancer).not.toMatch(/freelancerId/);
  });
});
