import { randomBytes } from "node:crypto";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { type ClientInput, clientSchema } from "@niryat/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../index";

describe.skipIf(!testDatabaseUrl)("client routes", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let app: ReturnType<typeof createApp>;
  const input: ClientInput = {
    name: "Acme Inc",
    country: "us",
    answers: {
      supplierInIndia: true,
      clientPresentInIndia: false,
      paidInForeignCurrency: true,
      sameEstablishment: false,
    },
  };

  beforeAll(async () => {
    t = await openTestDb();
    app = createApp({
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
    });
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function signup(email = "clients-a@example.com") {
    const response = await app.request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-battery" }),
    });
    expect(response.status).toBe(201);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    return cookie;
  }

  function save(cookie: string, body: unknown = input, id?: string) {
    return app.request(id ? `/clients/${id}` : "/clients", {
      method: id ? "PUT" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function list(cookie: string) {
    const response = await app.request("/clients", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return z.array(clientSchema).parse(await response.json());
  }

  it.each(["GET", "POST", "PUT"])("requires a session for %s", async (method) => {
    const response = await app.request(method === "PUT" ? "/clients/not-a-uuid" : "/clients", {
      method,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("creates and lists a normalized client with an eligible export check", async () => {
    const cookie = await signup();
    const response = await save(cookie);
    expect(response.status).toBe(201);
    const client = clientSchema.parse(await response.json());
    expect(client.name).toBe(input.name);
    expect(client.country).toBe("US");
    expect(client.exportCheck.answers).toEqual(input.answers);
    expect(client.exportCheck.result.eligible).toBe(true);
    expect(await list(cookie)).toEqual([client]);
  });

  it("fails the recipient condition for an Indian client", async () => {
    const cookie = await signup();
    const response = await save(cookie, { ...input, country: "IN" });
    expect(response.status).toBe(201);
    const client = clientSchema.parse(await response.json());
    expect(client.exportCheck.result.eligible).toBe(false);
    expect(client.exportCheck.result.conditions).toContainEqual(
      expect.objectContaining({ id: "recipient_outside_india", status: "fail" }),
    );
  });

  it("recomputes and stores the export check when answers change", async () => {
    const cookie = await signup();
    const created = await save(cookie);
    expect(created.status).toBe(201);
    const client = clientSchema.parse(await created.json());
    const answers = { ...input.answers, paidInForeignCurrency: null };
    const response = await save(cookie, { ...input, answers }, client.id);
    expect(response.status).toBe(200);
    const updated = clientSchema.parse(await response.json());
    expect(updated.id).toBe(client.id);
    expect(updated.exportCheck.answers).toEqual(answers);
    expect(updated.exportCheck.result.eligible).toBe(false);
    expect(updated.exportCheck.result.conditions).toContainEqual(
      expect.objectContaining({ id: "foreign_exchange", status: "unknown" }),
    );
    expect(await list(cookie)).toEqual([updated]);
  });

  it("never lists or updates another user's client", async () => {
    const a = await signup();
    const b = await signup("clients-b@example.com");
    const created = await save(a);
    expect(created.status).toBe(201);
    const client = clientSchema.parse(await created.json());
    expect(await list(b)).toEqual([]);
    const response = await save(b, { ...input, country: "IN" }, client.id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(await list(a)).toEqual([client]);
  });

  it("rejects a malformed UUID before querying", async () => {
    const cookie = await signup();
    const response = await save(cookie, input, "not-a-uuid");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it.each(["POST", "PUT"])(
    "rejects an invalid country on %s with field names only",
    async (method) => {
      const cookie = await signup();
      const created = await save(cookie);
      expect(created.status).toBe(201);
      const client = clientSchema.parse(await created.json());
      const response = await save(
        cookie,
        { ...input, country: "USA" },
        method === "PUT" ? client.id : undefined,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request", fields: ["country"] });
      expect(await list(cookie)).toEqual([client]);
    },
  );

  it.each(["POST", "PUT"])("rejects a non-JSON %s", async (method) => {
    const cookie = await signup();
    const created = await save(cookie);
    expect(created.status).toBe(201);
    const client = clientSchema.parse(await created.json());
    const response = await app.request(method === "PUT" ? `/clients/${client.id}` : "/clients", {
      method,
      headers: { Cookie: cookie, "Content-Type": "text/plain" },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    expect(await list(cookie)).toEqual([client]);
  });
});
