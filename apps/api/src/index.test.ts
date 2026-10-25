import { purposeCodesResponseSchema } from "@niryat/shared";
import { expect, it } from "vitest";
import { loadAuthEnv, loadEnv } from "./env";
import { createApp } from "./index";
import { todayInIndia } from "./rules";

it("serves a healthy response without credentials or a database", async () => {
  const response = await createApp().request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
it("serves cited purpose codes without credentials or a database", async () => {
  const response = await createApp().request("/purpose-codes");
  expect(response.status).toBe(200);
  const catalogue = purposeCodesResponseSchema.parse(await response.json());
  expect(catalogue.codes).toHaveLength(14);
  expect(catalogue.citation.ruleId).toBe("PURPOSE_CODES");
});
it("formats today's date in India as YYYY-MM-DD", () => {
  expect(todayInIndia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
it("disables auth without DATABASE_URL and rejects incomplete auth configuration", () => {
  expect(loadAuthEnv({})).toBeUndefined();
  expect(loadAuthEnv({ DATABASE_URL: "" })).toBeUndefined();
  expect(() => loadAuthEnv({ DATABASE_URL: "postgres://x@y/z" })).toThrow(
    "ENCRYPTION_KEY, SESSION_SECRET",
  );
});
it("validates environment before starting the server", () => {
  expect(loadEnv({}).PORT).toBe(3001);
  expect(() => loadEnv({ PORT: "invalid" })).toThrow("PORT");
  expect(() => loadEnv({ PAYPAL_ENVIRONMENT: "PRODUCTION" })).toThrow("PAYPAL_ENVIRONMENT");
});
