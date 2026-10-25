import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the password and rejects a different password", async () => {
    const stored = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", stored)).toBe(true);
    expect(await verifyPassword("wrong-horse-battery", stored)).toBe(false);
  });

  it("uses a random salt for each hash", async () => {
    expect(await hashPassword("correct-horse-battery")).not.toBe(
      await hashPassword("correct-horse-battery"),
    );
  });

  it.each([
    "not-a-hash",
    "scrypt$16384$8$1$invalid$invalid",
    "scrypt$16384$8$1$YQ==$Yg==",
    `scrypt$1048576$8$1$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(64).toString("base64")}`,
  ])("rejects malformed or unsupported stored hash %s", async (stored) => {
    expect(await verifyPassword("correct-horse-battery", stored)).toBe(false);
  });
});
