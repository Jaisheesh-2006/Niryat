import { exportConditionIds, type StoredExportCheck } from "@niryat/shared";
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

  const input = { name: "Synthetic Client", country: "US", exportCheck };

  it("creates and lists clients ordered by name", async () => {
    const user = await addUser();
    const first = await createClient(t.db, user.id, input);
    expect(first).toEqual({ id: expect.any(String), ...input });
    expect(await listClients(t.db, user.id)).toEqual([first]);
    const second = await createClient(t.db, user.id, { ...input, name: "Acme Inc" });
    expect(await listClients(t.db, user.id)).toEqual([second, first]);
  });

  it("updates the name, country and export check", async () => {
    const user = await addUser();
    const client = await createClient(t.db, user.id, input);
    const updated = {
      name: "Local Co",
      country: "IN",
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
    expect(await updateClient(t.db, user.id, client.id, updated)).toEqual({
      id: client.id,
      ...updated,
    });
    expect(await listClients(t.db, user.id)).toEqual([{ id: client.id, ...updated }]);
  });

  it("does not list another user's clients", async () => {
    const a = await addUser();
    const b = await addUser("b@example.com");
    await createClient(t.db, a.id, input);
    expect(await listClients(t.db, b.id)).toEqual([]);
  });

  it("does not update another user's client", async () => {
    const a = await addUser();
    const b = await addUser("b@example.com");
    const client = await createClient(t.db, a.id, input);
    expect(
      await updateClient(t.db, b.id, client.id, { ...input, name: "Changed", country: "IN" }),
    ).toBeUndefined();
    expect(await listClients(t.db, a.id)).toEqual([client]);
  });

  it("rejects an invalid stored export check", async () => {
    const user = await addUser();
    await t.db.insert(clients).values({
      userId: user.id,
      name: input.name,
      country: input.country,
      exportCheckResult: {},
    });
    await expect(listClients(t.db, user.id)).rejects.toThrow("Stored client is invalid");
  });
});
