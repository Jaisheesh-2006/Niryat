import { z } from "zod";

// Placeholder boundary shared by future APIs. Domain schemas arrive with their specs.
export const identifierSchema = z.string().trim().min(1);
export type Identifier = z.infer<typeof identifierSchema>;
