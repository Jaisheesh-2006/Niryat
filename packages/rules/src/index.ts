import { z } from "zod";

// Metadata only. No legal/numeric rule is executable in the scaffold.
export const ruleMetadataSchema = z.strictObject({
  id: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  description: z.string().min(1),
  source: z.string().min(1),
  effective_from: z.iso.date().nullable(),
  verified: z.literal(false),
  logic: z.literal("TODO"),
});
export type RuleMetadata = z.infer<typeof ruleMetadataSchema>;
