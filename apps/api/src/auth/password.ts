import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(new Error("Password hashing failed"));
      else resolve(key);
    });
  });
}
const storedHashSchema = z.tuple([
  z.literal("scrypt"),
  z.literal("16384"),
  z.literal("8"),
  z.literal("1"),
  z.base64(),
  z.base64(),
]);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await deriveKey(password, salt);
  return `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = storedHashSchema.safeParse(stored.split("$"));
  if (!parsed.success) return false;
  const salt = Buffer.from(parsed.data[4], "base64");
  const expected = Buffer.from(parsed.data[5], "base64");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected);
}
