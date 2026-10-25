import { CA_NOTE, type HealthFlag, type RuleCitation } from "@niryat/shared";
import type { RuleMetadata } from "./index";

export function cite(rules: readonly RuleMetadata[], ruleId: string): RuleCitation {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Unknown rule id: ${ruleId}`);
  return { ruleId, source: rule.source, effectiveFrom: rule.effective_from };
}

export function flag(
  rules: readonly RuleMetadata[],
  ruleId: string,
  code: HealthFlag["code"],
  severity: HealthFlag["severity"],
  message: string,
): HealthFlag {
  return { code, severity, message, citation: cite(rules, ruleId), note: CA_NOTE };
}
