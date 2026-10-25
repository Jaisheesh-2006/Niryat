import { z } from "zod";

// Placeholder boundary shared by future APIs. Domain schemas arrive with their specs.
export const identifierSchema = z.string().trim().min(1);
export type Identifier = z.infer<typeof identifierSchema>;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
});
export type Credentials = z.infer<typeof credentialsSchema>;

export const profileInputSchema = z
  .object({
    gstRegistered: z.boolean(),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-Z]{15}$/)
      .nullable(),
    lutNumber: z.string().trim().min(1).max(64).nullable(),
    lutValidFrom: z.iso.date().nullable(),
    lutValidTo: z.iso.date().nullable(),
    workType: z.string().trim().min(1).max(200).nullable(),
    purposeCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^P\d{4}$/)
      .nullable(),
    panLast4: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-Z]{4}$/)
      .nullable(),
    expectedTurnoverInr: z.number().int().min(0).max(2_000_000_000).nullable(),
  })
  .refine((p) => !p.lutValidFrom || !p.lutValidTo || p.lutValidFrom <= p.lutValidTo, {
    path: ["lutValidTo"],
    message: "lutValidTo must not be before lutValidFrom",
  });
export type ProfileInput = z.infer<typeof profileInputSchema>;
