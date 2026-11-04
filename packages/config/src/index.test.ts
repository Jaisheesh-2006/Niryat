import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadApiUrl, parseEnv } from "./index";

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

describe("API URL environment boundary", () => {
  it("prefers the Render private address over a public API URL", () => {
    expect(
      loadApiUrl({
        API_INTERNAL_HOSTPORT: "niryat-api-example:10000",
        API_URL: "https://niryat-api.example/",
      }),
    ).toBe("http://niryat-api-example:10000");
  });

  it("preserves local defaults and explicit URL fallbacks", () => {
    expect(loadApiUrl({})).toBe("http://localhost:3001");
    expect(loadApiUrl({ API_URL: "" })).toBe("http://localhost:3001");
    expect(loadApiUrl({ API_URL: "http://localhost:4001///" })).toBe("http://localhost:4001");
  });

  it.each([
    "",
    "https://private.example",
    "user:secret@private:10000",
    "private:99999",
    "private:10000/path",
  ])("rejects invalid internal hostports without exposing values: %s", (value) => {
    expect(() => loadApiUrl({ API_INTERNAL_HOSTPORT: value })).toThrow(
      "Invalid environment: API_INTERNAL_HOSTPORT. See .env.example.",
    );
  });
});
