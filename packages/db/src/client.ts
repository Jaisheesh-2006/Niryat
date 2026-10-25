import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url, max: 5 });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}
