import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ruleMetadataSchema } from "./index";

describe("rule metadata table-driven pattern (no tax logic)", () => {
  it.each([
    { id: "EXPORT_CONDITIONS", verified: false, valid: true },
    { id: "invalid-id", verified: false, valid: false },
    { id: "LUT_REQUIRED", verified: true, valid: false },
  ])("$id with verified=$verified => $valid", ({ id, verified, valid }) => {
    expect(
      ruleMetadataSchema.safeParse({
        id,
        verified,
        description: "Placeholder",
        source: "docs/rules-sources.md",
        effective_from: null,
        logic: "TODO",
      }).success,
    ).toBe(valid);
  });
  it("keeps all twelve planned rules unverified and without executable logic", () => {
    const yaml = readFileSync(new URL("../rules/india-export.yaml", import.meta.url), "utf8");
    expect(yaml.match(/verified: false/g)).toHaveLength(12);
    expect(yaml.match(/logic: TODO/g)).toHaveLength(12);
  });
});
