import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { decryptField, encryptField, parseEncryptionKey } from "./index";

const key = randomBytes(32);
const context = `profiles.gstin:${randomUUID()}`;

it("decodes a 32-byte base64 key", () => {
  expect(parseEncryptionKey(key.toString("base64"))).toEqual(key);
});

it.each(["test field", "", "निर्यात 🌏"])("round trips %j", (plain) => {
  const stored = encryptField(plain, key, context);
  expect(stored).toMatch(/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$/);
  expect(decryptField(stored, key, context)).toBe(plain);
});

it("uses a fresh IV for each encryption", () => {
  const first = encryptField("test field", key, context);
  const second = encryptField("test field", key, context);
  expect(first.split(":")[1]).not.toBe(second.split(":")[1]);
  expect(first).not.toBe(second);
});

it("rejects a wrong key", () => {
  const stored = encryptField("test field", key, context);
  expect(() => decryptField(stored, randomBytes(32), context)).toThrow(
    "Encrypted field failed authentication",
  );
});

it.each([`profiles.gstin:${randomUUID()}`, context.replace("gstin", "pan_last4")])(
  "rejects a wrong context %s",
  (wrongContext) => {
    const stored = encryptField("test field", key, context);
    expect(() => decryptField(stored, key, wrongContext)).toThrow(
      "Encrypted field failed authentication",
    );
  },
);

it.each([1, 2, 3])("rejects tampering with component %i", (component) => {
  const parts = encryptField("test field", key, context).split(":");
  const part = parts[component];
  if (part === undefined) throw new Error("Missing encrypted component in test");
  parts[component] = (part.startsWith("A") ? "B" : "A") + part.slice(1);
  expect(() => decryptField(parts.join(":"), key, context)).toThrow(
    "Encrypted field failed authentication",
  );
});

const iv = randomBytes(12).toString("base64url");
const authTag = randomBytes(16).toString("base64url");

it.each([
  "garbage",
  "v2:a:b:c",
  `v2:${iv}:${authTag}:`,
  `v1:${iv}:${authTag}`,
  `v1:${iv}:${authTag}::extra`,
  `v1:AA:${authTag}:`,
  `v1:${iv}:AA:`,
  `v1:${iv}:${authTag}:!`,
  `v1:${iv}:${authTag}:A`,
  `v1:${iv}:${authTag}:AA==`,
  `v1:${iv}:${authTag}:AB`,
  `v1:${iv}:${"B".repeat(22)}:`,
])("rejects malformed encrypted data %j", (stored) => {
  expect(() => decryptField(stored, key, context)).toThrow("Encrypted field is malformed");
});

it.each([
  "",
  randomBytes(16).toString("base64"),
  key.toString("base64").slice(0, -1),
  `${key.toString("base64")}!`,
  `${key.toString("base64")}\n`,
])("rejects invalid key encoding or length (case %#)", (encoded) => {
  expect(() => parseEncryptionKey(encoded)).toThrow(
    "ENCRYPTION_KEY must be 32 bytes, base64-encoded",
  );
});
