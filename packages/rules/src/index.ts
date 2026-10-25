import { z } from "zod";

// Metadata only. No legal/numeric rule is executable yet.
// review: unchecked, or source_checked (matches primary law; see docs/rules-sources.md).
export const ruleMetadataSchema = z.strictObject({
  id: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  description: z.string().min(1),
  source: z.string().min(1),
  effective_from: z.iso.date().nullable(),
  review: z.enum(["unchecked", "source_checked"]),
  logic: z.literal("TODO"),
});
export type RuleMetadata = z.infer<typeof ruleMetadataSchema>;
