import { parse } from "yaml";
import { z } from "zod";
import { type RuleMetadata, ruleMetadataSchema } from "./index";

export const RULES_FILE_URL = new URL("../rules/india-export.yaml", import.meta.url);

export function parseRules(yamlText: string): RuleMetadata[] {
  let parsed: unknown;
  try {
    parsed = parse(yamlText, { logLevel: "error" });
  } catch {
    throw new Error("Rules file is invalid: rules");
  }

  const result = z.strictObject({ rules: z.array(ruleMetadataSchema).min(1) }).safeParse(parsed);
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.join(".") || "rules");
    throw new Error(`Rules file is invalid: ${paths.join(", ")}`);
  }

  const ids = new Set<string>();
  for (const rule of result.data.rules) {
    if (ids.has(rule.id)) throw new Error(`Duplicate rule id: ${rule.id}`);
    ids.add(rule.id);
  }
  return result.data.rules;
}
