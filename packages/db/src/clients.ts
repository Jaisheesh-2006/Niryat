import { type Client, clientSchema, type StoredExportCheck } from "@niryat/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { decryptField, encryptField } from "./encryption";
import { clients } from "./schema";

function toClient(row: typeof clients.$inferSelect, key: Buffer): Client {
  const result = clientSchema.safeParse({
    id: row.id,
    name: row.name,
    email: row.email,
    address:
      row.address === null ? null : decryptField(row.address, key, `clients.address:${row.userId}`),
    country: row.country,
    exportCheck: row.exportCheckResult,
  });
  if (!result.success) {
    throw new Error("Stored client is invalid");
  }
  return result.data;
}

export async function listClients(db: Db, userId: string, key: Buffer): Promise<Client[]> {
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, userId))
    .orderBy(asc(clients.name))
    .catch(() => {
      throw new Error("Client lookup failed");
    });
  return rows.map((row) => toClient(row, key));
}

export async function createClient(
  db: Db,
  userId: string,
  key: Buffer,
  input: {
    name: string;
    country: string;
    email: string | null;
    address: string | null;
    exportCheck: StoredExportCheck;
  },
): Promise<Client> {
  const [saved] = await db
    .insert(clients)
    .values({
      userId,
      name: input.name,
      country: input.country,
      email: input.email,
      address:
        input.address === null
          ? null
          : encryptField(input.address, key, `clients.address:${userId}`),
      exportCheckResult: input.exportCheck,
    })
    .returning()
    .catch(() => {
      throw new Error("Client save failed");
    });
  if (!saved) {
    throw new Error("Client save failed");
  }
  return toClient(saved, key);
}

export async function updateClient(
  db: Db,
  userId: string,
  key: Buffer,
  clientId: string,
  input: {
    name: string;
    country: string;
    email: string | null;
    address: string | null;
    exportCheck: StoredExportCheck;
  },
): Promise<Client | undefined> {
  const [saved] = await db
    .update(clients)
    .set({
      name: input.name,
      country: input.country,
      email: input.email,
      address:
        input.address === null
          ? null
          : encryptField(input.address, key, `clients.address:${userId}`),
      exportCheckResult: input.exportCheck,
    })
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .returning()
    .catch(() => {
      throw new Error("Client save failed");
    });
  return saved ? toClient(saved, key) : undefined;
}
