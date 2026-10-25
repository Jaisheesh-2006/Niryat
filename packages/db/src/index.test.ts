import { getTableName } from "drizzle-orm";
import { expect, it } from "vitest";
import * as schema from "./schema";

it("exports all twelve planned tables without opening a connection", () => {
  expect(Object.values(schema).map(getTableName).sort()).toEqual(
    [
      "users",
      "profiles",
      "clients",
      "invoices",
      "payments",
      "disputes",
      "fira_documents",
      "fira_lines",
      "matches",
      "agent_actions",
      "tasks",
      "rule_versions",
    ].sort(),
  );
});

it("requires a unique email and a password hash for users", () => {
  expect(schema.users.email.notNull).toBe(true);
  expect(schema.users.email.isUnique).toBe(true);
  expect(schema.users.passwordHash.notNull).toBe(true);
  expect(schema.users.passwordHash.name).toBe("password_hash");
});
