import { expect, it } from "vitest";
import {
  clientInputSchema,
  credentialsSchema,
  exportCheckResultSchema,
  exportConditionIds,
  identifierSchema,
  profileInputSchema,
} from "./index";

it("rejects empty identifiers at the boundary", () => {
  expect(identifierSchema.safeParse("  ").success).toBe(false);
  expect(identifierSchema.parse(" example ")).toBe("example");
});

const profile = {
  gstRegistered: true,
  gstin: "27ABCDE1234F1Z5",
  lutNumber: "LUT-1",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: "Software development",
  purposeCode: "P0802",
  panLast4: "234F",
  expectedTurnoverInr: 1_800_000,
};

it("accepts valid credentials and normalizes email", () => {
  expect(
    credentialsSchema.parse({ email: " Freelancer@Example.com ", password: "long-password" }),
  ).toEqual({ email: "freelancer@example.com", password: "long-password" });
});

it.each([11, 129])("rejects a password of %i characters", (length) => {
  expect(
    credentialsSchema.safeParse({ email: "freelancer@example.com", password: "x".repeat(length) })
      .success,
  ).toBe(false);
});

it("accepts a complete profile and normalizes its fields", () => {
  expect(profileInputSchema.parse(profile)).toEqual(profile);
  expect(
    profileInputSchema.parse({
      ...profile,
      gstin: " 27abcde1234f1z5 ",
      purposeCode: " p0802 ",
      panLast4: " 234f ",
    }),
  ).toEqual(profile);
});

it("accepts an incomplete profile with nullable fields", () => {
  const incomplete = {
    gstRegistered: false,
    gstin: null,
    lutNumber: null,
    lutValidFrom: null,
    lutValidTo: null,
    workType: null,
    purposeCode: null,
    panLast4: null,
    expectedTurnoverInr: null,
  };
  expect(profileInputSchema.parse(incomplete)).toEqual(incomplete);
});

it.each([
  { field: "gstin", value: "27ABCDE1234F1Z" },
  { field: "purposeCode", value: "P080" },
  { field: "lutValidTo", value: "2026-03-31" },
  { field: "expectedTurnoverInr", value: -1 },
  { field: "expectedTurnoverInr", value: 1.5 },
])("rejects an invalid $field and identifies its path", ({ field, value }) => {
  const result = profileInputSchema.safeParse({ ...profile, [field]: value });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual([field]);
  }
});

const client = {
  name: " Acme ",
  country: " us ",
  answers: {
    supplierInIndia: null,
    clientPresentInIndia: null,
    paidInForeignCurrency: null,
    sameEstablishment: null,
  },
};

it("normalizes a client name and country with all answers null", () => {
  expect(clientInputSchema.parse(client)).toEqual({ ...client, name: "Acme", country: "US" });
});

it("rejects a three-letter country and identifies its path", () => {
  const result = clientInputSchema.safeParse({ ...client, country: "USA" });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["country"]);
  }
});

it("strips userId from a client body", () => {
  expect(
    clientInputSchema.parse({ ...client, userId: "00000000-0000-4000-8000-000000000001" }),
  ).not.toHaveProperty("userId");
});

it("rejects an export check with four conditions instead of five", () => {
  const check = {
    eligible: true,
    conditions: exportConditionIds.map((id) => ({
      id,
      status: "pass",
      reference: "Test reference",
      message: "Test message",
    })),
    citation: { ruleId: "EXPORT_CONDITIONS", source: "Test source", effectiveFrom: null },
    checkedOn: "2026-10-26",
  };
  expect(exportCheckResultSchema.safeParse(check).success).toBe(true);
  const result = exportCheckResultSchema.safeParse({
    ...check,
    conditions: check.conditions.slice(0, 4),
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["conditions"]);
  }
});
