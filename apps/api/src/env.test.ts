import { expect, it } from "vitest";
import { loadAiEnv, loadEnv, loadFileStorageEnv, loadPayPalEnv } from "./env";

it("enables AI only with all keys and a positive finite budget, reporting key names only", () => {
  expect(loadAiEnv({})).toBeUndefined();
  expect(loadAiEnv({ ANTHROPIC_API_KEY: "" })).toBeUndefined();
  expect(() => loadAiEnv({ ANTHROPIC_API_KEY: "private-key" })).toThrow(
    "Invalid environment: CLAUDE_MODEL, AI_MONTHLY_BUDGET_USD. See .env.example.",
  );
  const input = {
    ANTHROPIC_API_KEY: "private-key",
    CLAUDE_MODEL: "test-model",
    AI_MONTHLY_BUDGET_USD: "5.00",
  };
  expect(loadAiEnv(input)).toEqual(input);
  for (const budget of ["0", "-1", "NaN", "Infinity", "1e5", "9".repeat(400)]) {
    expect(() => loadAiEnv({ ...input, AI_MONTHLY_BUDGET_USD: budget })).toThrow(
      "Invalid environment: AI_MONTHLY_BUDGET_USD. See .env.example.",
    );
  }
});

it("keeps optional integrations disabled when their first key is empty", () => {
  expect(loadPayPalEnv({})).toBeUndefined();
  expect(loadPayPalEnv({ PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "" })).toBeUndefined();
  expect(loadFileStorageEnv({})).toBeUndefined();
  expect(loadFileStorageEnv({ FILE_STORAGE_URL: "" })).toBeUndefined();
});

it("requires every PayPal key once the client ID is set, without exposing values", () => {
  expect(() => loadPayPalEnv({ PAYPAL_CLIENT_ID: "private-client-id" })).toThrow(
    "Invalid environment: PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID. See .env.example.",
  );
  expect(
    loadPayPalEnv({
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "secret",
      PAYPAL_WEBHOOK_ID: "webhook-id",
    }),
  ).toEqual({
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "secret",
    PAYPAL_WEBHOOK_ID: "webhook-id",
  });
});

it("requires storage credentials and defaults its region to auto", () => {
  expect(() => loadFileStorageEnv({ FILE_STORAGE_URL: "https://storage.example/bucket" })).toThrow(
    "Invalid environment: FILE_STORAGE_ACCESS_KEY_ID, FILE_STORAGE_SECRET_ACCESS_KEY. See .env.example.",
  );
  const input = {
    FILE_STORAGE_URL: "https://storage.example/bucket/",
    FILE_STORAGE_ACCESS_KEY_ID: "access-key",
    FILE_STORAGE_SECRET_ACCESS_KEY: "secret-key",
  };
  expect(loadFileStorageEnv(input)).toEqual({
    ...input,
    FILE_STORAGE_URL: "https://storage.example/bucket",
    FILE_STORAGE_REGION: "auto",
  });
  expect(
    loadFileStorageEnv({ ...input, FILE_STORAGE_REGION: "us-east-1" })?.FILE_STORAGE_REGION,
  ).toBe("us-east-1");
  expect(loadFileStorageEnv({ ...input, FILE_STORAGE_REGION: "" })?.FILE_STORAGE_REGION).toBe(
    "auto",
  );
  expect(() => loadFileStorageEnv({ ...input, FILE_STORAGE_URL: "invalid-private-url" })).toThrow(
    "Invalid environment: FILE_STORAGE_URL. See .env.example.",
  );
});

it("defaults, validates and strips trailing slashes from the public app URL", () => {
  expect(loadEnv({}).PUBLIC_APP_URL).toBe("http://localhost:3000");
  expect(loadEnv({ PUBLIC_APP_URL: "" }).PUBLIC_APP_URL).toBe("http://localhost:3000");
  expect(loadEnv({ PUBLIC_APP_URL: "https://niryat.example///" }).PUBLIC_APP_URL).toBe(
    "https://niryat.example",
  );
  expect(() => loadEnv({ PUBLIC_APP_URL: "invalid-private-url" })).toThrow(
    "Invalid environment: PUBLIC_APP_URL. See .env.example.",
  );
});
