import { fileURLToPath } from "node:url";
import { parseEnv } from "@niryat/config";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { z } from "zod";
import { createDb, type Db } from "./client";

export const testDatabaseUrl: string | undefined = process.env.TEST_DATABASE_URL || undefined;

export async function openTestDb(): Promise<{
  db: Db;
  close: () => Promise<void>;
  reset: () => Promise<void>;
}> {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  }
  const { TEST_DATABASE_URL: url } = parseEnv(z.object({ TEST_DATABASE_URL: z.url() }), {
    TEST_DATABASE_URL: testDatabaseUrl,
  });
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  } catch {
    await close();
    throw new Error("TEST_DATABASE_URL migration failed");
  }
  return {
    db,
    close,
    reset: async () => {
      await db.execute(
        sql`TRUNCATE users, profiles, clients, invoices, payments, disputes, fira_documents, fira_lines, matches, agent_actions, tasks, rule_versions RESTART IDENTITY CASCADE`,
      );
    },
  };
}
