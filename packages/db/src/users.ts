import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { users } from "./schema";

export async function createUser(
  db: Db,
  input: { email: string; passwordHash: string },
): Promise<{ id: string; email: string } | null> {
  const [user] = await db
    .insert(users)
    .values(input)
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email })
    .catch(() => {
      throw new Error("User creation failed");
    });
  return user ?? null;
}

export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<{ id: string; email: string; passwordHash: string } | undefined> {
  const [user] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .catch(() => {
      throw new Error("User lookup failed");
    });
  return user;
}

export async function findUserById(
  db: Db,
  id: string,
): Promise<{ id: string; email: string } | undefined> {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .catch(() => {
      throw new Error("User lookup failed");
    });
  return user;
}
