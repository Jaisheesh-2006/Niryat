import { randomBytes } from "node:crypto";
import { exportConditionIds, type StoredExportCheck } from "@niryat/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clients, createClient, createUser, listClients, updateClient } from "./index";
import { openTestDb, testDatabaseUrl } from "./testing";

const exportCheck: StoredExportCheck = {
  answers: {
    supplierInIndia: true,
    clientPresentInIndia: false,
    paidInForeignCurrency: true,
    sameEstablishment: false,
  },
  result: {
    eligible: true,
    conditions: exportConditionIds.map((id) => ({
      id,
      status: "pass",
      reference: "IGST Act 2017, s. 2(6)",
      message: "Test",
    })),
    citation: {
      ruleId: "EXPORT_CONDITIONS",
      source: "IGST Act 2017, s. 2(6)",
      effectiveFrom: "2019-02-01",
    },
    checkedOn: "2026-10-26",
  },
};
const key = randomBytes(32);

describe.skipIf(!testDatabaseUrl)("client storage", () => {
  let t: Awaited<ReturnType<typeof openTestDb>>;

  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function addUser(email = "a@example.com") {
    const user = await createUser(t.db, { email, passwordHash: "test-password-hash" });
    if (!user) {
      throw new Error("Test user was not created");
    }
    return user;
  }

  const input = {
    name: "Synthetic Client",
    country: "US",
    email: null,
    address: null,
    exportCheck,
  };

  it("creates and lists clients ordered by name", async () => {
    const user = await addUser();
    const first = await createClient(t.db, user.id, key, input);
    expect(first).toEqual({ id: expect.any(String), ...input });
    expect(await listClients(t.db, user.id, key)).toEqual([first]);
    const second = await createClient(t.db, user.id, key, { ...input, name: "Acme Inc" });
    expect(await listClients(t.db, user.id, key)).toEqual([second, first]);
  });

  it("round trips an encrypted address and clears email and address", async () => {
    const user = await addUser();
    const contact = { ...input, email: "buyer@example.com", address: "123 Main St, New York" };
    const client = await createClient(t.db, user.id, key, contact);
    expect(client).toEqual({ id: expect.any(String), ...contact });
    expect(await listClients(t.db, user.id, key)).toEqual([client]);
    const [row] = await t.db.select().from(clients).where(eq(clients.id, client.id));
    expect(row?.address).toMatch(/^v1:/);
    expect(row?.address).not.toBe(contact.address);
    expect(row?.email).toBe(contact.email);
    expect(await updateClient(t.db, user.id, key, client.id, input)).toEqual({
      id: client.id,
      ...input,
    });
    const [cleared] = await t.db.select().from(clients).where(eq(clients.id, client.id));
    expect(cleared?.address).toBeNull();
    expect(cleared?.email).toBeNull();
  });

  it("updates the name, country, contact details and export check", async () => {
    const user = await addUser();
    const client = await createClient(t.db, user.id, key, input);
    const updated = {
      name: "Local Co",
      country: "IN",
      email: "buyer@example.com",
      address: "12 MG Road, Pune 411001",
      exportCheck: {
        answers: { ...exportCheck.answers, supplierInIndia: false },
        result: {
          ...exportCheck.result,
          eligible: false,
          conditions: exportCheck.result.conditions.map((condition) => ({
            ...condition,
            status: "fail" as const,
          })),
        },
      },
    };
    expect(await updateClient(t.db, user.id, key, client.id, updated)).toEqual({
      id: client.id,
      ...updated,
    });
    expect(await listClients(t.db, user.id, key)).toEqual([{ id: client.id, ...updated }]);
    const [row] = await t.db.select().from(clients).where(eq(clients.id, client.id));
    expect(row?.address).toMatch(/^v1:/);
    expect(row?.address).not.toBe(updated.address);
  });

  it("does not list another user's clients", async () => {
    const a = await addUser();
    const b = await addUser("b@example.com");
    await createClient(t.db, a.id, key, input);
    expect(await listClients(t.db, b.id, key)).toEqual([]);
  });

  it("does not update another user's client", async () => {
    const a = await addUser();
    const b = await addUser("b@example.com");
    const client = await createClient(t.db, a.id, key, input);
    expect(
      await updateClient(t.db, b.id, key, client.id, { ...input, name: "Changed", country: "IN" }),
    ).toBeUndefined();
    expect(await listClients(t.db, a.id, key)).toEqual([client]);
  });

  it("rejects address ciphertext copied from another user's row", async () => {
    const a = await addUser();
    const b = await addUser("b@example.com");
    const client = await createClient(t.db, a.id, key, {
      ...input,
      address: "123 Main St, New York",
    });
    const [row] = await t.db.select().from(clients).where(eq(clients.id, client.id));
    if (!row) throw new Error("Test client was not saved");
    await t.db.insert(clients).values({
      userId: b.id,
      name: input.name,
      country: input.country,
      address: row.address,
      exportCheckResult: exportCheck,
    });
    await expect(listClients(t.db, b.id, key)).rejects.toThrow("failed authentication");
  });

  it("rejects an invalid stored export check", async () => {
    const user = await addUser();
    await t.db.insert(clients).values({
      userId: user.id,
      name: input.name,
      country: input.country,
      exportCheckResult: {},
    });
    await expect(listClients(t.db, user.id, key)).rejects.toThrow("Stored client is invalid");
  });
});
