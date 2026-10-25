import { z } from "zod";

// logic is TODO or the name of the exported function that implements the rule.
// review: unchecked, or source_checked (matches primary law; see docs/rules-sources.md).
export const ruleMetadataSchema = z.strictObject({
  id: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  description: z.string().min(1),
  source: z.string().min(1),
  effective_from: z.iso.date().nullable(),
  review: z.enum(["unchecked", "source_checked"]),
  logic: z.string().regex(/^(TODO|[a-z][A-Za-z0-9]*)$/),
});
export type RuleMetadata = z.infer<typeof ruleMetadataSchema>;

export * from "./cite";
export * from "./export-conditions";
export * from "./health";
export * from "./load";
export * from "./purpose-codes";
