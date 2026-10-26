import { type ProfileInput, profileInputSchema } from "@niryat/shared";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { decryptField, encryptField } from "./encryption";
import { profiles } from "./schema";

function parseProfile(input: unknown): ProfileInput {
  const result = profileInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid profile fields: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return result.data;
}

function decryptProfile(row: typeof profiles.$inferSelect, key: Buffer): ProfileInput {
  return parseProfile({
    ...row,
    address:
      row.address === null
        ? null
        : decryptField(row.address, key, `profiles.address:${row.userId}`),
    gstin: row.gstin === null ? null : decryptField(row.gstin, key, `profiles.gstin:${row.userId}`),
    panLast4:
      row.panLast4 === null
        ? null
        : decryptField(row.panLast4, key, `profiles.pan_last4:${row.userId}`),
  });
}

export async function upsertProfile(
  db: Db,
  userId: string,
  input: ProfileInput,
  key: Buffer,
): Promise<ProfileInput> {
  const profile = parseProfile(input);
  const values = {
    ...profile,
    address:
      profile.address === null
        ? null
        : encryptField(profile.address, key, `profiles.address:${userId}`),
    gstin:
      profile.gstin === null ? null : encryptField(profile.gstin, key, `profiles.gstin:${userId}`),
    panLast4:
      profile.panLast4 === null
        ? null
        : encryptField(profile.panLast4, key, `profiles.pan_last4:${userId}`),
  };
  const [saved] = await db
    .insert(profiles)
    .values({ ...values, userId })
    .onConflictDoUpdate({ target: profiles.userId, set: values })
    .returning()
    .catch(() => {
      throw new Error("Profile save failed");
    });
  if (!saved) {
    throw new Error("Profile was not saved");
  }
  return decryptProfile(saved, key);
}

export async function getProfile(
  db: Db,
  userId: string,
  key: Buffer,
): Promise<ProfileInput | undefined> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .catch(() => {
      throw new Error("Profile lookup failed");
    });
  return profile ? decryptProfile(profile, key) : undefined;
}
