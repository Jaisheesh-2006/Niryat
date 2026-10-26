import { randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import {
  exportConditionIds,
  type ProfileInput,
  profileInputSchema,
  type StoredExportCheck,
} from "@niryat/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "./client";
import {
  actionStore,
  createClient,
  createUser,
  findPdfByToken,
  findUserByEmail,
  findUserById,
  getInvoiceForAction,
  getProfile,
  issueInvoice,
  knownTransactionIds,
  listClients,
  listInvoices,
  markSent,
  profiles,
  recordPayment,
  rejectAction,
  setPayPalInvoiceId,
  setPayPalSeriesId,
  updateClient,
  upsertProfile,
} from "./index";
import * as schema from "./schema";
import { openTestDb, testDatabaseUrl } from "./testing";

const key = randomBytes(32);
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
const profile: ProfileInput = {
  legalName: "Ananya Rao",
  address: "12 MG Road, Pune 411001",
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

describe("storage query failures", () => {
  const userId = randomUUID();
  const email = "synthetic@example.invalid";
  const passwordHash = "synthetic-password-hash";
  const name = "Synthetic Client";

  it.each([
    {
      operation: "createUser",
      run: (db: Db) => createUser(db, { email, passwordHash }),
      message: "User creation failed",
    },
    {
      operation: "findUserByEmail",
      run: (db: Db) => findUserByEmail(db, email),
      message: "User lookup failed",
    },
    {
      operation: "findUserById",
      run: (db: Db) => findUserById(db, userId),
      message: "User lookup failed",
    },
    {
      operation: "upsertProfile",
      run: (db: Db) => upsertProfile(db, userId, profile, key),
      message: "Profile save failed",
    },
    {
      operation: "getProfile",
      run: (db: Db) => getProfile(db, userId, key),
      message: "Profile lookup failed",
    },
    {
      operation: "listClients",
      run: (db: Db) => listClients(db, userId, key),
      message: "Client lookup failed",
    },
    {
      operation: "createClient",
      run: (db: Db) =>
        createClient(db, userId, key, {
          name,
          country: "US",
          email,
          address: profile.address,
          exportCheck,
        }),
      message: "Client save failed",
    },
    {
      operation: "updateClient",
      run: (db: Db) =>
        updateClient(db, userId, key, randomUUID(), {
          name,
          country: "US",
          email,
          address: profile.address,
          exportCheck,
        }),
      message: "Client save failed",
    },
    {
      operation: "issueInvoice",
      run: (db: Db) =>
        issueInvoice(
          db,
          userId,
          {
            clientId: userId,
            type: "one_time",
            date: "2026-10-26",
            fy: "2026-27",
            currency: "USD",
            amount: "100.00",
            description: "Synthetic invoice",
            sac: "998314",
            recurrence: null,
          },
          async () => ({
            pdfToken: "synthetic-token",
            pdfUrl: "https://example.invalid/pdf",
            action: { paypalAction: "send_invoice", payload: {} },
          }),
          () => "2026-27/0001",
        ),
      message: "Invoice save failed",
    },
    {
      operation: "listInvoices",
      run: (db: Db) => listInvoices(db, userId),
      message: "Invoice lookup failed",
    },
    {
      operation: "getInvoiceForAction",
      run: (db: Db) => getInvoiceForAction(db, userId, userId),
      message: "Invoice lookup failed",
    },
    {
      operation: "findPdfByToken",
      run: (db: Db) => findPdfByToken(db, "synthetic-token"),
      message: "Invoice lookup failed",
    },
    {
      operation: "setPayPalInvoiceId",
      run: (db: Db) => setPayPalInvoiceId(db, userId, userId, "INV2-SYNTHETIC"),
      message: "Invoice save failed",
    },
    {
      operation: "setPayPalSeriesId",
      run: (db: Db) => setPayPalSeriesId(db, userId, userId, "SERIES-SYNTHETIC"),
      message: "Invoice save failed",
    },
    {
      operation: "markSent",
      run: (db: Db) => markSent(db, userId, userId),
      message: "Invoice save failed",
    },
    {
      operation: "claim",
      run: (db: Db) => actionStore(db).claim(userId, userId),
      message: "Action save failed",
    },
    {
      operation: "finish",
      run: (db: Db) => actionStore(db).finish(userId, { status: "failed", error: "HTTP_503" }),
      message: "Action save failed",
    },
    {
      operation: "rejectAction",
      run: (db: Db) => rejectAction(db, userId, userId),
      message: "Action save failed",
    },
    {
      operation: "recordPayment",
      run: (db: Db) =>
        recordPayment(db, {
          captureId: "CAPTURE-SYNTHETIC",
          status: "COMPLETED",
          paypalInvoiceId: "INV2-SYNTHETIC",
          gross: "100.00",
          fee: null,
          net: null,
          currency: "USD",
          fxRate: null,
          createTime: "2026-10-26T12:00:00Z",
        }),
      message: "Payment save failed",
    },
    {
      operation: "knownTransactionIds",
      run: (db: Db) => knownTransactionIds(db, ["CAPTURE-SYNTHETIC"]),
      message: "Payment lookup failed",
    },
  ])("$operation does not expose query values or causes", async ({ run, message }) => {
    const secrets = [
      email,
      passwordHash,
      userId,
      profile.gstin,
      profile.panLast4,
      profile.address,
      name,
      "synthetic-token",
      "INV2-SYNTHETIC",
      "SERIES-SYNTHETIC",
      "CAPTURE-SYNTHETIC",
      "100.00",
    ];
    const failure = new Error(`Database failure: ${secrets.join(", ")}`);
    const pool = new Pool();
    const connect = vi.spyOn(pool, "connect").mockRejectedValue(failure);
    const query = vi.spyOn(pool, "query").mockImplementation(() => {
      throw failure;
    });
    try {
      let caught: unknown;
      try {
        await run(drizzle({ client: pool, schema }));
      } catch (error) {
        caught = error;
      }
      expect(query.mock.calls.length + connect.mock.calls.length).toBe(1);
      expect(caught).toBeInstanceOf(Error);
      if (!(caught instanceof Error)) {
        throw new Error("Expected a storage error");
      }
      expect(caught.message).toBe(message);
      expect(caught.cause).toBeUndefined();
      const logged = inspect(caught, { showHidden: true });
      for (const secret of secrets) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      query.mockRestore();
      connect.mockRestore();
      await pool.end();
    }
  });
});

describe.skipIf(!testDatabaseUrl)("user and profile storage", () => {
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

  it("creates a user, hides the hash, and rejects a duplicate email", async () => {
    const user = await addUser();
    expect(user).toEqual({ id: expect.any(String), email: "a@example.com" });
    expect(
      await createUser(t.db, { email: user.email, passwordHash: "different-test-hash" }),
    ).toBeNull();
  });

  it("finds a user by email with the password hash", async () => {
    const user = await addUser();
    expect(await findUserByEmail(t.db, user.email)).toEqual({
      ...user,
      passwordHash: "test-password-hash",
    });
    expect(await findUserByEmail(t.db, "unknown@example.com")).toBeUndefined();
  });

  it("finds a user by ID without exposing the password hash", async () => {
    const user = await addUser();
    expect(await findUserById(t.db, user.id)).toEqual(user);
    expect(await findUserById(t.db, randomUUID())).toBeUndefined();
  });

  it("round trips a profile and overwrites it on a second upsert", async () => {
    const user = await addUser();
    expect(await upsertProfile(t.db, user.id, profile, key)).toEqual(profile);
    expect(await getProfile(t.db, user.id, key)).toEqual(profile);
    const updated = {
      ...profile,
      legalName: null,
      address: null,
      gstin: null,
      panLast4: null,
      workType: "Consulting",
    };
    expect(await upsertProfile(t.db, user.id, updated, key)).toEqual(updated);
    expect(await getProfile(t.db, user.id, key)).toEqual(updated);
  });

  it("stores GSTIN, PAN fragment and address as ciphertext", async () => {
    const user = await addUser();
    await upsertProfile(t.db, user.id, profile, key);
    const [row] = await t.db.select().from(profiles);
    expect(row?.gstin).toMatch(/^v1:/);
    expect(row?.gstin).not.toBe(profile.gstin);
    expect(row?.panLast4).toMatch(/^v1:/);
    expect(row?.panLast4).not.toBe(profile.panLast4);
    expect(row?.address).toMatch(/^v1:/);
    expect(row?.address).not.toBe(profile.address);
  });

  it("isolates reads and updates by user ID and strips userId from input", async () => {
    const a = await addUser();
    const b = await addUser("b@example.com");
    await upsertProfile(t.db, a.id, profile, key);
    expect(await getProfile(t.db, b.id, key)).toBeUndefined();
    const bProfile = profileInputSchema.parse({ ...profile, userId: a.id, workType: "Consulting" });
    await upsertProfile(t.db, b.id, bProfile, key);
    expect(await getProfile(t.db, a.id, key)).toEqual(profile);
    expect(await getProfile(t.db, b.id, key)).toEqual(bProfile);
  });

  it.each(["gstin", "panLast4", "address"] as const)(
    "rejects %s ciphertext copied from another user's row",
    async (field) => {
      const a = await addUser();
      const b = await addUser("b@example.com");
      await upsertProfile(t.db, a.id, profile, key);
      await upsertProfile(t.db, b.id, profile, key);
      const [row] = await t.db.select().from(profiles).where(eq(profiles.userId, a.id));
      if (!row) {
        throw new Error("Test profile was not saved");
      }
      await t.db
        .update(profiles)
        .set({ [field]: row[field] })
        .where(eq(profiles.userId, b.id));
      await expect(getProfile(t.db, b.id, key)).rejects.toThrow("failed authentication");
    },
  );
});
