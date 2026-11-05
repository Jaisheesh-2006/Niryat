import { expect, it } from "vitest";
import {
  caClaimInputSchema,
  caLinkCreatedSchema,
  caLinkEndInputSchema,
  caLinkInputSchema,
  caLinkResponseSchema,
  caRequestsSchema,
} from "./index";

it("normalizes share email and rejects invalid boundary values", () => {
  expect(caLinkInputSchema.parse({ caEmail: " CA@Example.com " })).toEqual({
    caEmail: "ca@example.com",
  });
  for (const caEmail of [null, "", "not-email", 42]) {
    expect(caLinkInputSchema.safeParse({ caEmail }).success).toBe(false);
  }
});

it("validates private invitation codes and the one-time creation response", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const invitationCode = `${id}.${"a".repeat(64)}`;
  expect(caClaimInputSchema.parse({ invitationCode: ` ${invitationCode} ` })).toEqual({
    invitationCode,
  });
  for (const value of [
    null,
    "",
    id,
    `${id}.${"a".repeat(63)}`,
    `${id}.${"g".repeat(64)}`,
    `not-a-uuid.${"a".repeat(64)}`,
  ]) {
    expect(caClaimInputSchema.safeParse({ invitationCode: value }).success).toBe(false);
  }
  const link = {
    id,
    caEmail: "ca@example.com",
    status: "pending",
    createdAt: "2026-11-05T10:00:00.000Z",
    respondedAt: null,
  };
  expect(caLinkCreatedSchema.parse({ link, invitationCode })).toEqual({ link, invitationCode });
  expect(caLinkCreatedSchema.safeParse({ link }).success).toBe(false);
});

it("requires the specific link id when ending sharing", () => {
  const linkId = "10000000-0000-4000-8000-000000000001";
  expect(caLinkEndInputSchema.parse({ linkId })).toEqual({ linkId });
  for (const input of [{}, { linkId: "bad-id" }, { linkId: null }, { linkId, other: true }]) {
    expect(caLinkEndInputSchema.safeParse(input).success).toBe(false);
  }
});

it("validates share and request response identifiers, statuses and dates", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const createdAt = "2026-11-05T10:00:00.000Z";
  const link = { id, caEmail: "ca@example.com", status: "pending", createdAt, respondedAt: null };
  expect(caLinkResponseSchema.parse({ link: null })).toEqual({ link: null });
  expect(caLinkResponseSchema.parse({ link })).toEqual({ link });
  for (const invalid of [
    { id: "bad" },
    { status: "reopened" },
    { caEmail: "bad" },
    { createdAt: "bad" },
    { respondedAt: "bad" },
  ]) {
    expect(caLinkResponseSchema.safeParse({ link: { ...link, ...invalid } }).success).toBe(false);
  }
  const request = { id, freelancerName: null, freelancerEmail: "owner@example.com", createdAt };
  expect(caRequestsSchema.parse([request])).toEqual([request]);
  expect(caRequestsSchema.safeParse([{ ...request, freelancerEmail: "bad" }]).success).toBe(false);
});
