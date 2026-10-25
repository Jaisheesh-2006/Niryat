import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const base64urlSchema = z
  .base64url()
  .refine((value) => Buffer.from(value, "base64url").toString("base64url") === value);
const encryptedFieldSchema = z.tuple([
  z.literal("v1"),
  base64urlSchema.length(16),
  base64urlSchema.length(22),
  base64urlSchema,
]);

export function parseEncryptionKey(base64: string): Buffer {
  if (!z.base64().safeParse(base64).success) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32 || key.toString("base64") !== base64) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export function encryptField(plain: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptField(stored: string, key: Buffer, context: string): string {
  const result = encryptedFieldSchema.safeParse(stored.split(":"));
  if (!result.success) {
    throw new Error("Encrypted field is malformed");
  }
  const [, iv, authTag, ciphertext] = result.data;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted field failed authentication");
  }
}
