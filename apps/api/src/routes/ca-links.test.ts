import { randomBytes, randomUUID } from "node:crypto";
import { createUser, profiles } from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { caLinkCreatedSchema, caLinkResponseSchema, caRequestsSchema } from "@niryat/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";

describe.skipIf(!testDatabaseUrl)("CA link routes", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let app: ReturnType<typeof createApp>;
  let owner: { id: string; cookie: string };
  let other: { id: string; cookie: string };
  let ca: { id: string; cookie: string };
  let otherCa: { id: string; cookie: string };
  const secret = "x".repeat(32);
  const id = "10000000-0000-4000-8000-000000000001";
  const routes = [
    ["GET", "/ca-link", "freelancer"],
    ["POST", "/ca-link", "freelancer"],
    ["POST", "/ca-link/end", "freelancer"],
    ["GET", "/ca/requests", "ca"],
    ["POST", "/ca/requests/claim", "ca"],
    ["POST", `/ca/requests/${id}/accept`, "ca"],
    ["POST", `/ca/requests/${id}/decline`, "ca"],
    ["POST", `/ca/clients/${id}/end`, "ca"],
  ] as const;
  beforeAll(async () => {
    t = await openTestDb();
    app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: secret,
      secureCookies: false,
    });
  });
  beforeEach(async () => {
    await t.reset();
    async function account(email: string, role: "freelancer" | "ca") {
      const user = await createUser(t.db, { email, role });
      if (!user) throw new Error("Expected account");
      return { id: user.id, cookie: await cookieFor(user.id, secret, role) };
    }
    owner = await account("owner@example.com", "freelancer");
    other = await account("other@example.com", "freelancer");
    ca = await account("ca@example.com", "ca");
    otherCa = await account("other-ca@example.com", "ca");
  });
  afterAll(async () => {
    await t?.close();
  });
  function post(path: string, cookie: string, body: unknown = {}) {
    return app.request(path, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function invite(email = "ca@example.com", cookie = owner.cookie) {
    const response = await post("/ca-link", cookie, { caEmail: email });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    return caLinkCreatedSchema.parse(await response.json());
  }
  async function current(cookie = owner.cookie) {
    const response = await app.request("/ca-link", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    const parsed = caLinkResponseSchema.parse(json);
    expect(json).toEqual(parsed);
    return parsed.link;
  }
  async function requests(cookie = ca.cookie) {
    const response = await app.request("/ca/requests", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return caRequestsSchema.parse(await response.json());
  }

  it.each(routes)("denies anonymous and wrong-role %s %s", async (method, path, role) => {
    for (const cookie of ["", role === "ca" ? owner.cookie : ca.cookie]) {
      const response = await app.request(path, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthenticated" });
    }
  });

  it("creates normalized requests without requiring a recipient account and exposes only the owner's active link", async () => {
    expect(await current()).toBeNull();
    const { link, invitationCode } = await invite("  FUTURE@EXAMPLE.COM  ");
    expect(link.caEmail).toBe("future@example.com");
    expect(await current()).toEqual(link);
    expect(await current(other.cookie)).toBeNull();
    expect(await requests()).toEqual([]);
    const signup = await post("/auth/ca/signup", "", {
      email: "future@example.com",
      password: "review-regression-password",
    });
    expect(signup.status).toBe(201);
    const cookie = signup.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected CA cookie");
    expect(await requests(cookie)).toEqual([]);
    for (const response of ["accept", "decline"]) {
      const denied = await post(`/ca/requests/${link.id}/${response}`, cookie);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual({ error: "not_found" });
    }
    const guessed = await post("/ca/requests/claim", cookie, {
      invitationCode: `${link.id}.${"0".repeat(64)}`,
    });
    expect(guessed.status).toBe(404);
    expect(await guessed.json()).toEqual({ error: "invalid_invitation" });
    expect((await post("/ca/requests/claim", cookie, { invitationCode })).status).toBe(204);
    expect(await requests(cookie)).toEqual([
      {
        id: link.id,
        freelancerName: null,
        freelancerEmail: "owner@example.com",
        createdAt: link.createdAt,
      },
    ]);
  });

  it("rejects own email and existing pending or accepted links", async () => {
    const own = await post("/ca-link", owner.cookie, { caEmail: " OWNER@Example.com " });
    expect(own.status).toBe(400);
    expect(await own.json()).toEqual({ error: "own_email" });
    const { link, invitationCode } = await invite();
    expect((await post("/ca/requests/claim", ca.cookie, { invitationCode })).status).toBe(204);
    for (const accepted of [false, true]) {
      if (accepted)
        expect((await post(`/ca/requests/${link.id}/accept`, ca.cookie)).status).toBe(204);
      const duplicate = await post("/ca-link", owner.cookie, { caEmail: "other-ca@example.com" });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toEqual({ error: "link_exists" });
    }
  });

  it.each(["accept", "decline"] as const)("only the invited CA can %s once", async (response) => {
    const { link, invitationCode } = await invite();
    await t.db
      .insert(profiles)
      .values({ userId: owner.id, legalName: "Ananya Rao", address: "encrypted" });
    expect(await requests()).toEqual([]);
    expect((await post("/ca/requests/claim", otherCa.cookie, { invitationCode })).status).toBe(404);
    expect((await post("/ca/requests/claim", ca.cookie, { invitationCode })).status).toBe(204);
    expect(await requests()).toEqual([
      {
        id: link.id,
        freelancerName: "Ananya Rao",
        freelancerEmail: "owner@example.com",
        createdAt: link.createdAt,
      },
    ]);
    expect(await requests(otherCa.cookie)).toEqual([]);
    const path = `/ca/requests/${link.id}/${response}`;
    const wrong = await post(path, otherCa.cookie);
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toEqual({ error: "not_found" });
    const first = await post(path, ca.cookie);
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");
    expect((await post("/ca/requests/claim", ca.cookie, { invitationCode })).status).toBe(404);
    expect((await post(path, ca.cookie)).status).toBe(404);
    expect(await requests()).toEqual([]);
    expect(await current()).toEqual(
      response === "accept"
        ? { ...link, status: "accepted", respondedAt: expect.any(String) }
        : null,
    );
    if (response === "decline") expect((await invite()).link.id).not.toBe(link.id);
    // Acceptance grants B4 read access; a decline grants none, and writes stay freelancer-only.
    const read = await app.request(`/tasks?client=${owner.id}`, { headers: { Cookie: ca.cookie } });
    expect(read.status).toBe(response === "accept" ? 200 : 404);
    expect(await read.json()).toEqual(response === "accept" ? [] : { error: "not_found" });
    expect((await post("/invoices", ca.cookie)).status).toBe(401);
  });

  it.each([false, true])(
    "only the freelancer can cancel/stop sharing (accepted=%s)",
    async (accepted) => {
      const { link, invitationCode } = await invite();
      expect((await post("/ca/requests/claim", ca.cookie, { invitationCode })).status).toBe(204);
      if (accepted)
        expect((await post(`/ca/requests/${link.id}/accept`, ca.cookie)).status).toBe(204);
      expect((await post("/ca-link/end", other.cookie, { linkId: link.id })).status).toBe(404);
      expect((await post("/ca-link/end", owner.cookie, { linkId: link.id })).status).toBe(204);
      expect((await post("/ca-link/end", owner.cookie, { linkId: link.id })).status).toBe(404);
      expect((await post(`/ca/requests/${link.id}/accept`, ca.cookie)).status).toBe(404);
      expect(await current()).toBeNull();
      expect((await invite()).link.id).not.toBe(link.id);
      const ended = await t.db.query.caLinks.findFirst({
        where: (row, { eq }) => eq(row.id, link.id),
      });
      expect(ended).toMatchObject({
        status: "ended",
        endedBy: "freelancer",
        endedAt: expect.any(Date),
      });
    },
  );

  it("only the accepted CA can stop managing, and the freelancer can invite again", async () => {
    const { link, invitationCode } = await invite();
    expect((await post("/ca/requests/claim", ca.cookie, { invitationCode })).status).toBe(204);
    const path = `/ca/clients/${owner.id}/end`;
    expect((await post(path, ca.cookie, { linkId: link.id })).status).toBe(404);
    expect((await post(`/ca/requests/${link.id}/accept`, ca.cookie)).status).toBe(204);
    expect((await post(path, otherCa.cookie, { linkId: link.id })).status).toBe(404);
    expect((await post(`/ca/clients/${other.id}/end`, ca.cookie, { linkId: link.id })).status).toBe(
      404,
    );
    expect((await post(path, ca.cookie, { linkId: link.id })).status).toBe(204);
    expect((await post(path, ca.cookie, { linkId: link.id })).status).toBe(404);
    const ended = await t.db.query.caLinks.findFirst({
      where: (row, { eq }) => eq(row.id, link.id),
    });
    expect(ended).toMatchObject({ status: "ended", endedBy: "ca", endedAt: expect.any(Date) });
    expect((await invite()).link.id).not.toBe(link.id);
  });

  it("keeps cancellation final when accepting concurrently", async () => {
    const { link, invitationCode } = await invite();
    expect((await post("/ca/requests/claim", ca.cookie, { invitationCode })).status).toBe(204);
    const [accept, cancel] = await Promise.all([
      post(`/ca/requests/${link.id}/accept`, ca.cookie),
      post("/ca-link/end", owner.cookie, { linkId: link.id }),
    ]);
    expect([204, 404]).toContain(accept.status);
    expect(cancel.status).toBe(204);
    expect(await current()).toBeNull();
    expect((await post(`/ca/requests/${link.id}/accept`, ca.cookie)).status).toBe(404);
  });

  it.each(["accept", "decline", "end"])(
    "returns 404 for malformed/unknown ids on %s",
    async (action) => {
      for (const bad of ["invalid", randomUUID()]) {
        const path = action === "end" ? `/ca/clients/${bad}/end` : `/ca/requests/${bad}/${action}`;
        const response = await post(path, ca.cookie, action === "end" ? { linkId: id } : {});
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "not_found" });
      }
    },
  );

  it.each(routes.filter(([method]) => method === "POST"))(
    "requires valid JSON for %s %s",
    async (_method, path, role) => {
      const cookie = role === "ca" ? ca.cookie : owner.cookie;
      const unsupported = await app.request(path, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "text/plain" },
        body: "{}",
      });
      expect(unsupported.status).toBe(415);
      expect(await unsupported.json()).toEqual({ error: "unsupported_media_type" });
      for (const body of ["{", "null", "[]"]) {
        const response = await app.request(path, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body,
        });
        expect(response.status).toBe(400);
      }
    },
  );

  it("does not reveal codes on reads or redeem old codes for replacement invitations", async () => {
    const first = await invite();
    expect(await current()).toEqual(first.link);
    expect(await requests()).toEqual([]);
    expect((await post("/ca-link/end", owner.cookie, { linkId: first.link.id })).status).toBe(204);
    const second = await invite();
    const stale = await post("/ca/requests/claim", ca.cookie, {
      invitationCode: first.invitationCode,
    });
    expect(stale.status).toBe(404);
    expect(await stale.json()).toEqual({ error: "invalid_invitation" });
    expect(await requests()).toEqual([]);
    expect(
      (
        await post("/ca/requests/claim", ca.cookie, {
          invitationCode: ` ${second.invitationCode} `,
        })
      ).status,
    ).toBe(204);
    expect(
      (await post("/ca/requests/claim", ca.cookie, { invitationCode: second.invitationCode }))
        .status,
    ).toBe(204);
    expect(await requests()).toEqual([
      {
        id: second.link.id,
        freelancerName: null,
        freelancerEmail: "owner@example.com",
        createdAt: second.link.createdAt,
      },
    ]);
  });

  it.each([false, true])(
    "rejects a stale freelancer end after a replacement is created (accepted=%s)",
    async (accepted) => {
      const first = await invite();
      if (accepted) {
        expect(
          (await post("/ca/requests/claim", ca.cookie, { invitationCode: first.invitationCode }))
            .status,
        ).toBe(204);
        expect((await post(`/ca/requests/${first.link.id}/accept`, ca.cookie)).status).toBe(204);
      }
      expect((await post("/ca-link/end", owner.cookie, { linkId: first.link.id })).status).toBe(
        204,
      );
      const second = await invite("other-ca@example.com");
      const stale = await post("/ca-link/end", owner.cookie, { linkId: first.link.id });
      expect(stale.status).toBe(404);
      expect(await stale.json()).toEqual({ error: "not_found" });
      expect(await current()).toEqual(second.link);
    },
  );

  it("rejects a stale CA end after a new link to the same client is accepted", async () => {
    const first = await invite();
    expect(
      (await post("/ca/requests/claim", ca.cookie, { invitationCode: first.invitationCode }))
        .status,
    ).toBe(204);
    expect((await post(`/ca/requests/${first.link.id}/accept`, ca.cookie)).status).toBe(204);
    const path = `/ca/clients/${owner.id}/end`;
    expect((await post(path, ca.cookie, { linkId: first.link.id })).status).toBe(204);
    const second = await invite();
    expect(
      (await post("/ca/requests/claim", ca.cookie, { invitationCode: second.invitationCode }))
        .status,
    ).toBe(204);
    expect((await post(`/ca/requests/${second.link.id}/accept`, ca.cookie)).status).toBe(204);
    const before = await current();
    const stale = await post(path, ca.cookie, { linkId: first.link.id });
    expect(stale.status).toBe(404);
    expect(await stale.json()).toEqual({ error: "not_found" });
    expect(await current()).toEqual(before);
  });

  it.each(["freelancer", "ca"])("requires a valid link id when %s ends sharing", async (actor) => {
    const path = actor === "ca" ? `/ca/clients/${owner.id}/end` : "/ca-link/end";
    const cookie = actor === "ca" ? ca.cookie : owner.cookie;
    for (const body of [{}, { linkId: "private-bad-id" }, { linkId: null }, { linkId: 42 }]) {
      const response = await post(path, cookie, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request", fields: ["linkId"] });
    }
    const unknown = await post(path, cookie, { linkId: randomUUID() });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not_found" });
  });

  it("rejects invalid invitation codes with field names only", async () => {
    for (const invitationCode of ["private-invalid-code", null, 42, ""]) {
      const response = await post("/ca/requests/claim", ca.cookie, { invitationCode });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_request",
        fields: ["invitationCode"],
      });
    }
  });

  it("rejects invalid share emails with field names only", async () => {
    for (const caEmail of ["secret-invalid-email", null, 42]) {
      const response = await post("/ca-link", owner.cookie, { caEmail });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request", fields: ["caEmail"] });
    }
  });
});
