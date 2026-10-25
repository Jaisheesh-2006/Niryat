import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleMetadataSchema } from "./index";

describe("rule metadata table-driven pattern (no tax logic)", () => {
  it.each([
    { id: "EXPORT_CONDITIONS", review: "source_checked", valid: true },
    { id: "PURPOSE_CODES", review: "unchecked", valid: true },
    { id: "invalid-id", review: "source_checked", valid: false },
    { id: "LUT_REQUIRED", review: "ca_reviewed", valid: false },
  ])("$id with review=$review => $valid", ({ id, review, valid }) => {
    expect(
      ruleMetadataSchema.safeParse({
        id,
        review,
        description: "Placeholder",
        source: "docs/rules-sources.md",
        effective_from: null,
        logic: "TODO",
      }).success,
    ).toBe(valid);
  });
  it("gives all twelve planned rules a review status and no executable logic", () => {
    const yaml = readFileSync(new URL("../rules/india-export.yaml", import.meta.url), "utf8");
    expect(yaml.match(/review: (unchecked|source_checked)/g)).toHaveLength(12);
    expect(yaml.match(/logic: TODO/g)).toHaveLength(12);
  });
});
