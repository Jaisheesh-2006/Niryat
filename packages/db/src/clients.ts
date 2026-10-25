import { type Client, clientSchema, type StoredExportCheck } from "@niryat/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { clients } from "./schema";

function toClient(row: typeof clients.$inferSelect): Client {
  const result = clientSchema.safeParse({
    id: row.id,
    name: row.name,
    country: row.country,
    exportCheck: row.exportCheckResult,
  });
  if (!result.success) {
    throw new Error("Stored client is invalid");
  }
  return result.data;
}

export async function listClients(db: Db, userId: string): Promise<Client[]> {
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, userId))
    .orderBy(asc(clients.name))
    .catch(() => {
      throw new Error("Client lookup failed");
    });
  return rows.map(toClient);
}

export async function createClient(
  db: Db,
  userId: string,
  input: { name: string; country: string; exportCheck: StoredExportCheck },
): Promise<Client> {
  const [saved] = await db
    .insert(clients)
    .values({
      userId,
      name: input.name,
      country: input.country,
      exportCheckResult: input.exportCheck,
    })
    .returning()
    .catch(() => {
      throw new Error("Client save failed");
    });
  if (!saved) {
    throw new Error("Client save failed");
  }
  return toClient(saved);
}

export async function updateClient(
  db: Db,
  userId: string,
  clientId: string,
  input: { name: string; country: string; exportCheck: StoredExportCheck },
): Promise<Client | undefined> {
  const [saved] = await db
    .update(clients)
    .set({ name: input.name, country: input.country, exportCheckResult: input.exportCheck })
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .returning()
    .catch(() => {
      throw new Error("Client save failed");
    });
  return saved ? toClient(saved) : undefined;
}
