import { expect, it } from "vitest";
import { loadEnv } from "./env";
import { app } from "./index";

it("serves a healthy response without credentials or a database", async () => {
  const response = await app.request("/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
it("validates environment before starting the server", () => {
  expect(loadEnv({}).PORT).toBe(3001);
  expect(() => loadEnv({ PORT: "invalid" })).toThrow("PORT");
  expect(() => loadEnv({ PAYPAL_ENVIRONMENT: "PRODUCTION" })).toThrow("PAYPAL_ENVIRONMENT");
});
