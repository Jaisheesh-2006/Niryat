import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "./index";

describe("environment boundary", () => {
  const schema = z.object({ PORT: z.coerce.number().int().min(1).max(65535).default(3001) });
  it("accepts valid input and applies defaults", () => {
    expect(parseEnv(schema, { PORT: "4000" })).toEqual({ PORT: 4000 });
    expect(parseEnv(schema, {})).toEqual({ PORT: 3001 });
  });
  it("fails with the key but does not leak the rejected value", () => {
    expect(() => parseEnv(schema, { PORT: "private-value" })).toThrow("Invalid environment: PORT");
    expect(() => parseEnv(schema, { PORT: "private-value" })).not.toThrow("private-value");
  });
});
