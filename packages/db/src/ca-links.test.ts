import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimCaRequest,
  createCaLink,
  endCaClientLink,
  endCaLink,
  getCaLink,
  hasAcceptedCaLink,
  listCaRequests,
  respondToCaRequest,
} from "./ca-links";
import { caLinks, profiles } from "./schema";
import { openTestDb, testDatabaseUrl } from "./testing";
import { createUser } from "./users";

describe.skipIf(!testDatabaseUrl)("CA links", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let freelancerId: string;
  let caId: string;
  const now = new Date("2026-11-05T10:00:00.000Z");
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    const freelancer = await createUser(t.db, { email: "owner@example.com" });
    const ca = await createUser(t.db, { email: "ca@example.com", role: "ca" });
    if (!freelancer || !ca) throw new Error("Expected test accounts");
    freelancerId = freelancer.id;
    caId = ca.id;
  });
  afterAll(async () => {
    await t?.close();
  });

  async function invite(email = "ca@example.com") {
    const result = await createCaLink(t.db, freelancerId, email);
    if (!result.ok) throw new Error("Expected test link");
    return { link: result.link, invitationCode: result.invitationCode };
  }
  async function stored(id: string) {
    const [row] = await t.db.select().from(caLinks).where(eq(caLinks.id, id));
    if (!row) throw new Error("Expected stored link");
    return row;
  }

  it("grants access only to the accepted CA/client pair and revokes it on end", async () => {
    expect(await hasAcceptedCaLink(t.db, caId, freelancerId)).toBe(false);
    const { link, invitationCode } = await invite();
    expect(await hasAcceptedCaLink(t.db, caId, freelancerId)).toBe(false);
    expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
    expect(await hasAcceptedCaLink(t.db, caId, freelancerId)).toBe(false);
    expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(true);
    expect(await hasAcceptedCaLink(t.db, caId, freelancerId)).toBe(true);
    expect(await hasAcceptedCaLink(t.db, randomUUID(), freelancerId)).toBe(false);
    expect(await hasAcceptedCaLink(t.db, caId, randomUUID())).toBe(false);
    expect(await hasAcceptedCaLink(t.db, freelancerId, caId)).toBe(false);
    expect(await endCaClientLink(t.db, caId, freelancerId, link.id, now)).toBe(true);
    expect(await hasAcceptedCaLink(t.db, caId, freelancerId)).toBe(false);
  });

  it("normalizes email and accepts a request created before the CA account exists", async () => {
    expect(await getCaLink(t.db, freelancerId)).toBeNull();
    const { link, invitationCode } = await invite("  FUTURE@Example.com  ");
    expect(link).toEqual({
      id: expect.any(String),
      caEmail: "future@example.com",
      status: "pending",
      createdAt: expect.any(String),
      respondedAt: null,
    });
    expect(await getCaLink(t.db, freelancerId)).toEqual(link);
    const future = await createUser(t.db, { email: "future@example.com", role: "ca" });
    if (!future) throw new Error("Expected CA");
    expect(await listCaRequests(t.db, future.id)).toEqual([]);
    expect(await respondToCaRequest(t.db, future.id, link.id, "accept", now)).toBe(false);
    expect(await claimCaRequest(t.db, future.id, invitationCode)).toBe(true);
    expect(await listCaRequests(t.db, future.id)).toEqual([
      {
        id: link.id,
        freelancerName: null,
        freelancerEmail: "owner@example.com",
        createdAt: link.createdAt,
      },
    ]);
    expect(await respondToCaRequest(t.db, future.id, link.id, "accept", now)).toBe(true);
    expect(await stored(link.id)).toMatchObject({
      status: "accepted",
      caUserId: future.id,
      respondedAt: now,
      endedBy: null,
      endedAt: null,
    });
    expect(await getCaLink(t.db, freelancerId)).toEqual({
      ...link,
      status: "accepted",
      respondedAt: now.toISOString(),
    });
    expect(await listCaRequests(t.db, future.id)).toEqual([]);
  });

  it("lists only this email's pending requests and projects no private profile fields", async () => {
    const { link, invitationCode } = await invite();
    await t.db
      .insert(profiles)
      .values({ userId: freelancerId, legalName: "Ananya Rao", address: "encrypted" });
    expect(await listCaRequests(t.db, caId)).toEqual([]);
    expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
    expect(await listCaRequests(t.db, caId)).toEqual([
      {
        id: link.id,
        freelancerName: "Ananya Rao",
        freelancerEmail: "owner@example.com",
        createdAt: link.createdAt,
      },
    ]);
    expect(await listCaRequests(t.db, freelancerId)).toEqual([]);
  });

  it("rejects own email, invalid email and a CA as owner", async () => {
    expect(await createCaLink(t.db, freelancerId, " OWNER@example.com ")).toEqual({
      ok: false,
      reason: "own_email",
    });
    await expect(invite("not-email")).rejects.toThrow();
    await expect(createCaLink(t.db, caId, "other@example.com")).rejects.toThrow(
      "owner must be a freelancer",
    );
    expect(await getCaLink(t.db, freelancerId)).toBeNull();
  });

  it("allows only one concurrent active request and retains the constraint after acceptance", async () => {
    const results = await Promise.all([
      createCaLink(t.db, freelancerId, "ca@example.com"),
      createCaLink(t.db, freelancerId, "other@example.com"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "link_exists" }]);
    const link = await getCaLink(t.db, freelancerId);
    if (!link) throw new Error("Expected active link");
    if (link.caEmail !== "ca@example.com") {
      const other = await createUser(t.db, { email: link.caEmail, role: "ca" });
      if (!other) throw new Error("Expected CA");
      caId = other.id;
    }
    const created = results.find((result) => result.ok);
    if (!created?.ok) throw new Error("Expected created link");
    expect(await claimCaRequest(t.db, caId, created.invitationCode)).toBe(true);
    expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(true);
    expect(await createCaLink(t.db, freelancerId, "third@example.com")).toEqual({
      ok: false,
      reason: "link_exists",
    });
  });

  it.each(["accept", "decline"] as const)(
    "prevents wrong-email, wrong-role and repeated %s",
    async (response) => {
      const { link, invitationCode } = await invite();
      const other = await createUser(t.db, { email: "other@example.com", role: "ca" });
      if (!other) throw new Error("Expected CA");
      expect(await respondToCaRequest(t.db, other.id, link.id, response, now)).toBe(false);
      expect(await respondToCaRequest(t.db, freelancerId, link.id, response, now)).toBe(false);
      expect(await respondToCaRequest(t.db, caId, randomUUID(), response, now)).toBe(false);
      expect(await respondToCaRequest(t.db, caId, link.id, response, now)).toBe(false);
      expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
      const results = await Promise.all([
        respondToCaRequest(t.db, caId, link.id, response, now),
        respondToCaRequest(t.db, caId, link.id, response, now),
      ]);
      expect(results.sort()).toEqual([false, true]);
      expect(
        await respondToCaRequest(
          t.db,
          caId,
          link.id,
          response === "accept" ? "decline" : "accept",
          now,
        ),
      ).toBe(false);
      if (response === "decline") {
        expect(await stored(link.id)).toMatchObject({
          status: "ended",
          endedBy: "ca",
          endedAt: now,
          respondedAt: now,
          caUserId: caId,
        });
        expect(await getCaLink(t.db, freelancerId)).toBeNull();
        expect((await invite()).link.id).not.toBe(link.id);
      }
    },
  );

  it.each([false, true])(
    "lets only the owner end a link (accepted=%s), then create a new request",
    async (accepted) => {
      const { link, invitationCode } = await invite();
      if (accepted) {
        expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
        expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(true);
      }
      expect(await endCaLink(t.db, randomUUID(), link.id, now)).toBe(false);
      expect(await endCaLink(t.db, freelancerId, link.id, now)).toBe(true);
      expect(await endCaLink(t.db, freelancerId, link.id, now)).toBe(false);
      expect(await stored(link.id)).toMatchObject({
        status: "ended",
        endedBy: "freelancer",
        endedAt: now,
        respondedAt: accepted ? now : null,
      });
      expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(false);
      expect((await invite()).link.id).not.toBe(link.id);
    },
  );

  it("lets only the linked CA stop managing an accepted client", async () => {
    const { link, invitationCode } = await invite();
    expect(await endCaClientLink(t.db, caId, freelancerId, link.id, now)).toBe(false);
    expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
    expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(true);
    expect(await endCaClientLink(t.db, randomUUID(), freelancerId, link.id, now)).toBe(false);
    expect(await endCaClientLink(t.db, caId, randomUUID(), link.id, now)).toBe(false);
    expect(await endCaClientLink(t.db, caId, freelancerId, link.id, now)).toBe(true);
    expect(await endCaClientLink(t.db, caId, freelancerId, link.id, now)).toBe(false);
    expect(await stored(link.id)).toMatchObject({
      status: "ended",
      endedBy: "ca",
      endedAt: now,
      caUserId: caId,
    });
    expect((await invite()).link.id).not.toBe(link.id);
  });

  it("never reopens a link when accept races with cancellation", async () => {
    const { link, invitationCode } = await invite();
    expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
    const [, ended] = await Promise.all([
      respondToCaRequest(t.db, caId, link.id, "accept", now),
      endCaLink(t.db, freelancerId, link.id, now),
    ]);
    expect(ended).toBe(true);
    expect(await stored(link.id)).toMatchObject({
      status: "ended",
      endedBy: "freelancer",
      endedAt: now,
    });
    expect(await getCaLink(t.db, freelancerId)).toBeNull();
    expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(false);
  });

  it.each([false, true])(
    "does not end a replacement link from a stale freelancer action (accepted=%s)",
    async (accepted) => {
      const first = await invite();
      if (accepted) {
        expect(await claimCaRequest(t.db, caId, first.invitationCode)).toBe(true);
        expect(await respondToCaRequest(t.db, caId, first.link.id, "accept", now)).toBe(true);
      }
      expect(await endCaLink(t.db, freelancerId, first.link.id, now)).toBe(true);
      const second = await invite("replacement@example.com");
      expect(await endCaLink(t.db, freelancerId, first.link.id, now)).toBe(false);
      expect(await endCaLink(t.db, freelancerId, randomUUID(), now)).toBe(false);
      expect(await getCaLink(t.db, freelancerId)).toEqual(second.link);
    },
  );

  it("does not stop a newly accepted link from a stale CA action", async () => {
    const first = await invite();
    expect(await claimCaRequest(t.db, caId, first.invitationCode)).toBe(true);
    expect(await respondToCaRequest(t.db, caId, first.link.id, "accept", now)).toBe(true);
    expect(await endCaClientLink(t.db, caId, freelancerId, first.link.id, now)).toBe(true);
    const second = await invite();
    expect(await claimCaRequest(t.db, caId, second.invitationCode)).toBe(true);
    expect(await respondToCaRequest(t.db, caId, second.link.id, "accept", now)).toBe(true);
    expect(await endCaClientLink(t.db, caId, freelancerId, first.link.id, now)).toBe(false);
    expect(await getCaLink(t.db, freelancerId)).toEqual({
      ...second.link,
      status: "accepted",
      respondedAt: now.toISOString(),
    });
  });

  it("stores only the code hash and binds claims to the invited CA and pending link", async () => {
    const { link, invitationCode } = await invite();
    const row = await stored(link.id);
    expect(row.invitationCodeHash).toBe(createHash("sha256").update(invitationCode).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(invitationCode);
    expect(await getCaLink(t.db, freelancerId)).toEqual(link);
    const other = await createUser(t.db, { email: "wrong@example.com", role: "ca" });
    if (!other) throw new Error("Expected CA");
    expect(await claimCaRequest(t.db, other.id, invitationCode)).toBe(false);
    expect(await claimCaRequest(t.db, freelancerId, invitationCode)).toBe(false);
    const wrong = `${link.id}.${"0".repeat(64)}`;
    expect(await claimCaRequest(t.db, caId, wrong)).toBe(false);
    expect(await listCaRequests(t.db, caId)).toEqual([]);
    expect(await claimCaRequest(t.db, caId, ` ${invitationCode} `)).toBe(true);
    expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(true);
    expect(await respondToCaRequest(t.db, caId, link.id, "accept", now)).toBe(true);
    expect(await claimCaRequest(t.db, caId, invitationCode)).toBe(false);
    await expect(claimCaRequest(t.db, caId, "bad-code")).rejects.toThrow();
  });

  it("does not redeem cancelled codes against a replacement request", async () => {
    const first = await invite();
    expect(await endCaLink(t.db, freelancerId, first.link.id, now)).toBe(true);
    const second = await invite();
    expect(await claimCaRequest(t.db, caId, first.invitationCode)).toBe(false);
    expect(await listCaRequests(t.db, caId)).toEqual([]);
    expect(await claimCaRequest(t.db, caId, second.invitationCode)).toBe(true);
    expect(await listCaRequests(t.db, caId)).toEqual([
      {
        id: second.link.id,
        freelancerName: null,
        freelancerEmail: "owner@example.com",
        createdAt: second.link.createdAt,
      },
    ]);
  });

  it("enforces foreign keys and status/ended_by/invitation checks", async () => {
    await expect(
      t.db.execute(
        sql`INSERT INTO ca_links (freelancer_user_id, ca_email, status, invitation_code_hash) VALUES (${randomUUID()}, 'ca@example.com', 'pending', ${"a".repeat(64)})`,
      ),
    ).rejects.toThrow();
    await expect(
      t.db.execute(
        sql`INSERT INTO ca_links (freelancer_user_id, ca_email, status) VALUES (${freelancerId}, 'ca@example.com', 'pending')`,
      ),
    ).rejects.toThrow();
    await expect(
      t.db.execute(
        sql`INSERT INTO ca_links (freelancer_user_id, ca_email, status) VALUES (${freelancerId}, 'ca@example.com', 'invalid')`,
      ),
    ).rejects.toThrow();
    await expect(
      t.db.execute(
        sql`INSERT INTO ca_links (freelancer_user_id, ca_email, status, ended_by) VALUES (${freelancerId}, 'ca@example.com', 'ended', 'invalid')`,
      ),
    ).rejects.toThrow();
  });
});
