import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  type CaClient,
  type CaLink,
  caClientSchema,
  caInvitationCodeSchema,
  caLinkInputSchema,
  caLinkSchema,
  caRequestSchema,
} from "@niryat/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./client";
import { caLinks, profiles, users } from "./schema";
import { findUserById } from "./users";

const storedLinkSchema = caLinkSchema.extend({
  createdAt: z.date().transform((date) => date.toISOString()),
  respondedAt: z
    .date()
    .transform((date) => date.toISOString())
    .nullable(),
});
const linkFields = {
  id: caLinks.id,
  caEmail: caLinks.caEmail,
  status: caLinks.status,
  createdAt: caLinks.createdAt,
  respondedAt: caLinks.respondedAt,
};

export async function hasAcceptedCaLink(
  db: Db,
  caId: string,
  freelancerId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: caLinks.id })
    .from(caLinks)
    .where(
      and(
        eq(caLinks.caUserId, caId),
        eq(caLinks.freelancerUserId, freelancerId),
        eq(caLinks.status, "accepted"),
      ),
    )
    .limit(1)
    .catch(() => {
      throw new Error("CA client access lookup failed");
    });
  if (!row) return false;
  if (!z.object({ id: z.uuid() }).safeParse(row).success)
    throw new Error("Stored CA client access is invalid");
  return true;
}

export async function getCaLink(db: Db, freelancerId: string): Promise<CaLink | null> {
  const [row] = await db
    .select(linkFields)
    .from(caLinks)
    .where(
      and(
        eq(caLinks.freelancerUserId, freelancerId),
        inArray(caLinks.status, ["pending", "accepted"]),
      ),
    )
    .catch(() => {
      throw new Error("CA link lookup failed");
    });
  if (!row) return null;
  const parsed = storedLinkSchema.safeParse(row);
  if (!parsed.success) throw new Error("Stored CA link is invalid");
  return parsed.data;
}

export async function createCaLink(
  db: Db,
  freelancerId: string,
  email: string,
): Promise<
  | { ok: true; link: CaLink; invitationCode: string }
  | { ok: false; reason: "own_email" | "link_exists" }
> {
  const { caEmail } = caLinkInputSchema.parse({ caEmail: email });
  const owner = await findUserById(db, freelancerId);
  if (owner?.role !== "freelancer") throw new Error("CA link owner must be a freelancer");
  if (owner.email === caEmail) return { ok: false, reason: "own_email" };
  const id = randomUUID();
  const invitationCode = `${id}.${randomBytes(32).toString("hex")}`;
  const [row] = await db
    .insert(caLinks)
    .values({
      id,
      freelancerUserId: freelancerId,
      caEmail,
      status: "pending",
      invitationCodeHash: createHash("sha256").update(invitationCode).digest("hex"),
    })
    .onConflictDoNothing()
    .returning(linkFields)
    .catch(() => {
      throw new Error("CA link creation failed");
    });
  if (!row) return { ok: false, reason: "link_exists" };
  const parsed = storedLinkSchema.safeParse(row);
  if (!parsed.success) throw new Error("Stored CA link is invalid");
  return { ok: true, link: parsed.data, invitationCode };
}

export async function claimCaRequest(db: Db, caId: string, input: string): Promise<boolean> {
  const invitationCode = caInvitationCodeSchema.parse(input);
  const ca = await findUserById(db, caId);
  if (ca?.role !== "ca") return false;
  const [row] = await db
    .update(caLinks)
    .set({ caUserId: caId })
    .where(
      and(
        eq(caLinks.id, invitationCode.slice(0, 36)),
        eq(caLinks.caEmail, ca.email),
        eq(caLinks.invitationCodeHash, createHash("sha256").update(invitationCode).digest("hex")),
        eq(caLinks.status, "pending"),
      ),
    )
    .returning({ id: caLinks.id })
    .catch(() => {
      throw new Error("CA invitation claim failed");
    });
  return !!row;
}

export async function listCaRequests(db: Db, caId: string) {
  const ca = await findUserById(db, caId);
  if (ca?.role !== "ca") return [];
  const rows = await db
    .select({
      id: caLinks.id,
      freelancerName: profiles.legalName,
      freelancerEmail: users.email,
      createdAt: caLinks.createdAt,
    })
    .from(caLinks)
    .innerJoin(users, eq(users.id, caLinks.freelancerUserId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(eq(caLinks.caUserId, caId), eq(caLinks.caEmail, ca.email), eq(caLinks.status, "pending")),
    )
    .orderBy(asc(caLinks.createdAt), asc(caLinks.id))
    .catch(() => {
      throw new Error("CA requests lookup failed");
    });
  const parsed = z
    .array(
      caRequestSchema.extend({
        createdAt: z.date().transform((date) => date.toISOString()),
      }),
    )
    .safeParse(rows);
  if (!parsed.success) throw new Error("Stored CA request is invalid");
  return parsed.data;
}

export async function listCaClients(db: Db, caId: string): Promise<CaClient[]> {
  const rows = await db
    .select({
      linkId: caLinks.id,
      freelancerId: caLinks.freelancerUserId,
      name: profiles.legalName,
      email: users.email,
      sharedSince: caLinks.respondedAt,
    })
    .from(caLinks)
    .innerJoin(users, eq(users.id, caLinks.freelancerUserId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(caLinks.caUserId, caId), eq(caLinks.status, "accepted")))
    .orderBy(asc(caLinks.respondedAt), asc(caLinks.id))
    .catch(() => {
      throw new Error("CA clients lookup failed");
    });
  const parsed = z
    .array(caClientSchema.extend({ sharedSince: z.date().transform((d) => d.toISOString()) }))
    .safeParse(rows);
  if (!parsed.success) throw new Error("Stored CA client is invalid");
  return parsed.data;
}

export async function respondToCaRequest(
  db: Db,
  caId: string,
  id: string,
  response: "accept" | "decline",
  now: Date,
): Promise<boolean> {
  const ca = await findUserById(db, caId);
  if (ca?.role !== "ca") return false;
  const [row] = await db
    .update(caLinks)
    .set(
      response === "accept"
        ? { status: "accepted", caUserId: caId, respondedAt: now }
        : { status: "ended", endedBy: "ca", respondedAt: now, endedAt: now },
    )
    .where(
      and(
        eq(caLinks.id, id),
        eq(caLinks.caUserId, caId),
        eq(caLinks.caEmail, ca.email),
        eq(caLinks.status, "pending"),
      ),
    )
    .returning({ id: caLinks.id })
    .catch(() => {
      throw new Error("CA request response failed");
    });
  return !!row;
}

export async function endCaLink(
  db: Db,
  freelancerId: string,
  linkId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .update(caLinks)
    .set({ status: "ended", endedBy: "freelancer", endedAt: now })
    .where(
      and(
        eq(caLinks.freelancerUserId, freelancerId),
        eq(caLinks.id, linkId),
        inArray(caLinks.status, ["pending", "accepted"]),
      ),
    )
    .returning({ id: caLinks.id })
    .catch(() => {
      throw new Error("CA link end failed");
    });
  return !!row;
}

export async function endCaClientLink(
  db: Db,
  caId: string,
  freelancerId: string,
  linkId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await db
    .update(caLinks)
    .set({ status: "ended", endedBy: "ca", endedAt: now })
    .where(
      and(
        eq(caLinks.freelancerUserId, freelancerId),
        eq(caLinks.id, linkId),
        eq(caLinks.caUserId, caId),
        eq(caLinks.status, "accepted"),
      ),
    )
    .returning({ id: caLinks.id })
    .catch(() => {
      throw new Error("CA client link end failed");
    });
  return !!row;
}
