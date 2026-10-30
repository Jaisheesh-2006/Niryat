import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { users } from "./schema";

export async function createUser(
  db: Db,
  input: { email: string; passwordHash?: string; paypalId?: string },
): Promise<{ id: string; email: string } | null> {
  const [user] = await db
    .insert(users)
    .values({ email: input.email, passwordHash: input.passwordHash, paypalPayerId: input.paypalId })
    .onConflictDoNothing()
    .returning({ id: users.id, email: users.email })
    .catch(() => {
      throw new Error("User creation failed");
    });
  return user ?? null;
}

export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<{ id: string; email: string; passwordHash: string | null } | undefined> {
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

export async function signInWithPayPal(
  db: Db,
  input: { paypalId: string; email: string | undefined },
): Promise<
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; reason: "email_taken" | "no_email" }
> {
  try {
    const lookup = async () => {
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.paypalPayerId, input.paypalId));
      return user;
    };
    const existing = await lookup();
    if (existing) return { ok: true, user: existing };
    if (!input.email) return { ok: false, reason: "no_email" };
    const email = input.email.trim().toLowerCase();
    const created = await createUser(db, { email, paypalId: input.paypalId });
    if (created) return { ok: true, user: created };
    // Another callback may have inserted this payer ID or email while we were checking.
    const raced = await lookup();
    return raced ? { ok: true, user: raced } : { ok: false, reason: "email_taken" };
  } catch {
    throw new Error("PayPal sign-in failed");
  }
}
