import { getTableName } from "drizzle-orm";
import { expect, it } from "vitest";
import * as schema from "./index";

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
