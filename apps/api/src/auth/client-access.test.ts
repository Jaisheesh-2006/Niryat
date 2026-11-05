import { randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import type { UserRole } from "@niryat/shared";
import { Hono } from "hono";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { readClientAccess } from "./client-access";
import { cookieFor } from "./testing";

const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
const deps = { db: database.db, sessionSecret: "x".repeat(32) };
const self = randomUUID();
const other = randomUUID();
const app = new Hono().get("/", async (c) =>
  c.json((await readClientAccess(c, deps, c.req.query("client"))) ?? null),
);

afterEach(() => vi.restoreAllMocks());
afterAll(() => database.close());

describe("client access", () => {
  it.each<{
    role?: UserRole;
    client?: string;
    linked?: boolean;
    expected: { userId: string; viewer: "owner" | "ca" } | null;
  }>([
    { expected: null },
    { client: other, expected: null },
    { role: "freelancer", expected: { userId: self, viewer: "owner" } },
    { role: "freelancer", client: self, expected: { userId: self, viewer: "owner" } },
    { role: "freelancer", client: other, expected: null },
    { role: "freelancer", client: "", expected: null },
    { role: "freelancer", client: "bad", expected: null },
    { role: "ca", expected: null },
    { role: "ca", client: "", expected: null },
    { role: "ca", client: "bad", expected: null },
    { role: "ca", client: other, linked: false, expected: null },
    { role: "ca", client: self, linked: false, expected: null },
    { role: "ca", client: other, linked: true, expected: { userId: other, viewer: "ca" } },
  ])("resolves $role client=$client linked=$linked", async ({ role, client, linked, expected }) => {
    const lookup = vi.spyOn(db, "hasAcceptedCaLink").mockResolvedValue(linked ?? false);
    const cookie = role ? await cookieFor(self, deps.sessionSecret, role) : "";
    const response = await app.request(client === undefined ? "/" : `/?client=${client}`, {
      headers: { Cookie: cookie },
    });
    expect(await response.json()).toEqual(expected);
    if (linked !== undefined) expect(lookup).toHaveBeenCalledExactlyOnceWith(deps.db, self, client);
    else expect(lookup).not.toHaveBeenCalled();
  });

  it("does not treat a tampered session as an owner or CA", async () => {
    const lookup = vi.spyOn(db, "hasAcceptedCaLink");
    const cookie = await cookieFor(self, deps.sessionSecret, "ca");
    const response = await app.request(`/?client=${other}`, {
      headers: { Cookie: `${cookie}tampered` },
    });
    expect(await response.json()).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["freelancer", "ca"] as const)(
    "rejects duplicate client parameters for %s",
    async (role) => {
      const lookup = vi.spyOn(db, "hasAcceptedCaLink").mockResolvedValue(true);
      const cookie = await cookieFor(self, deps.sessionSecret, role);
      const response = await app.request(`/?client=${self}&client=${other}`, {
        headers: { Cookie: cookie },
      });
      expect(await response.json()).toBeNull();
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it("propagates infrastructure failures without granting access", async () => {
    vi.spyOn(db, "hasAcceptedCaLink").mockRejectedValue(new Error("lookup failed"));
    const caught = vi.fn();
    const failingApp = new Hono().route("/", app).onError((error, c) => {
      caught(error);
      return c.json({ error: "internal_error" }, 500);
    });
    const response = await failingApp.request(`/?client=${other}`, {
      headers: { Cookie: await cookieFor(self, deps.sessionSecret, "ca") },
    });
    expect(response.status).toBe(500);
    expect(caught).toHaveBeenCalledWith(new Error("lookup failed"));
  });
});
