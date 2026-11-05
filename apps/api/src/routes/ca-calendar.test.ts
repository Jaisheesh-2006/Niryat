import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { caCalendarSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";
import * as clock from "../rules";

describe("CA calendar authentication", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = createApp(deps);
  beforeEach(() => {
    vi.spyOn(db, "listCaClients").mockResolvedValue([]);
    vi.spyOn(db, "getProfile").mockResolvedValue(undefined);
    vi.spyOn(db, "listInvoices").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  it("denies anonymous and freelancer sessions before reading records", async () => {
    for (const cookie of ["", await cookieFor(randomUUID(), deps.sessionSecret)]) {
      const response = await app.request("/ca/calendar", { headers: { Cookie: cookie } });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthenticated" });
    }
    expect(db.listCaClients).not.toHaveBeenCalled();
    expect(db.getProfile).not.toHaveBeenCalled();
    expect(db.listInvoices).not.toHaveBeenCalled();
  });

  it("returns an empty calendar for a CA without accepted clients", async () => {
    const id = randomUUID();
    const response = await app.request("/ca/calendar", {
      headers: { Cookie: await cookieFor(id, deps.sessionSecret, "ca") },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clients: [], events: [] });
    expect(db.listCaClients).toHaveBeenCalledExactlyOnceWith(deps.db, id);
    expect(db.getProfile).not.toHaveBeenCalled();
    expect(db.listInvoices).not.toHaveBeenCalled();
  });
});

describe.skipIf(!testDatabaseUrl)("CA calendar accepted-link isolation", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  const secret = "x".repeat(32);
  const key = randomBytes(32);
  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-11-05");
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await t?.close();
  });

  it("includes only accepted clients, keeps IDs unique, projects identity, and removes revoked clients", async () => {
    async function account(email: string, role: "freelancer" | "ca") {
      const user = await db.createUser(t.db, { email, role });
      if (!user) throw new Error("Expected account");
      return user;
    }
    const ca = await account("ca-calendar@example.test", "ca");
    const otherCa = await account("other-ca@example.test", "ca");
    const owners = await Promise.all(
      Array.from({ length: 6 }, (_, i) => account(`calendar-${i}@example.test`, "freelancer")),
    );
    const [first, second, pending, ended, other, unlinked] = owners;
    if (!first || !second || !pending || !ended || !other || !unlinked)
      throw new Error("Expected owners");
    const links = new Map<string, string>();
    for (const owner of [first, second, pending, ended, other]) {
      const recipient = owner === other ? otherCa : ca;
      const invitation = await db.createCaLink(t.db, owner.id, recipient.email);
      if (!invitation.ok) throw new Error("Expected invitation");
      links.set(owner.id, invitation.link.id);
      expect(await db.claimCaRequest(t.db, recipient.id, invitation.invitationCode)).toBe(true);
      if (owner !== pending)
        expect(
          await db.respondToCaRequest(t.db, recipient.id, invitation.link.id, "accept", new Date()),
        ).toBe(true);
      if (owner === ended)
        expect(await db.endCaLink(t.db, owner.id, invitation.link.id, new Date())).toBe(true);
    }
    await t.db
      .insert(db.profiles)
      .values({ userId: first.id, legalName: "Shared name <client>", gstRegistered: false });
    for (const [index, owner] of owners.entries()) {
      const clientId = randomUUID();
      const invoiceId = randomUUID();
      await t.db
        .insert(db.clients)
        .values({ id: clientId, userId: owner.id, name: "Customer", country: "US" });
      await t.db.insert(db.invoices).values({
        id: invoiceId,
        userId: owner.id,
        clientId,
        type: "one_time",
        number: `2026-27/000${index + 1}`,
        fy: "2026-27",
        seq: index + 1,
        date: owner === first ? "2025-01-01" : "2026-10-01",
        currency: "USD",
        amount: "100.00",
        description: "Work",
        sac: "998314",
        status: "sent",
      });
      if (owner === first) {
        await t.db.insert(db.disputes).values({
          invoiceId,
          paypalDisputeId: "OLD-OPEN",
          amount: "10.00",
          currency: "USD",
          reason: "OTHER",
          status: "OPEN",
          responseDueDate: "2026-01-01",
          paypalUpdatedAt: new Date("2026-01-01T00:00:00Z"),
        });
      }
    }
    const app = createApp({
      db: t.db,
      encryptionKey: key,
      sessionSecret: secret,
      secureCookies: false,
    });
    const cookie = await cookieFor(ca.id, secret, "ca");
    async function calendar(path = "/ca/calendar", session = cookie) {
      const response = await app.request(path, { headers: { Cookie: session } });
      expect(response.status).toBe(200);
      const json: unknown = await response.json();
      const parsed = caCalendarSchema.parse(json);
      expect(json).toEqual(parsed);
      return parsed;
    }
    const result = await calendar();
    expect(result.clients).toEqual(
      expect.arrayContaining([
        { id: first.id, name: "Shared name <client>" },
        { id: second.id, name: "Unnamed freelancer" },
      ]),
    );
    expect(result.clients).toHaveLength(2);
    expect(
      result.events
        .filter((event) => event.freelancerId === first.id && event.state === "overdue")
        .map(({ kind, date }) => ({ kind, date })),
    ).toEqual([
      { kind: "rbi_deadline", date: "2025-10-01" },
      { kind: "dispute_response", date: "2026-01-01" },
    ]);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(result.events.length);
    for (const owner of [first, second]) {
      const events = result.events.filter((event) => event.freelancerId === owner.id);
      expect(events.some((event) => event.kind === "advance_tax")).toBe(true);
      expect(events.some((event) => event.kind === "rbi_deadline")).toBe(true);
      expect(
        events.every(
          (event) =>
            event.id.startsWith(`${owner.id}:`) && event.href === `/ca/clients/${owner.id}`,
        ),
      ).toBe(true);
    }
    expect(
      result.events.every(
        (event) => event.freelancerId === first.id || event.freelancerId === second.id,
      ),
    ).toBe(true);
    expect(await calendar(`/ca/calendar?client=${unlinked.id}`)).toEqual(result);
    const otherResult = await calendar("/ca/calendar", await cookieFor(otherCa.id, secret, "ca"));
    expect(otherResult.clients.map((client) => client.id)).toEqual([other.id]);
    expect(otherResult.events.every((event) => event.freelancerId === other.id)).toBe(true);
    const linkId = links.get(first.id);
    if (!linkId) throw new Error("Expected accepted link");
    expect(await db.endCaLink(t.db, first.id, linkId, new Date())).toBe(true);
    const revoked = await calendar();
    expect(revoked.clients.map((client) => client.id)).toEqual([second.id]);
    expect(revoked.events.every((event) => event.freelancerId === second.id)).toBe(true);
  });
});
