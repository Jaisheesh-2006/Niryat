import assert from "node:assert/strict";
import { dirname, isAbsolute, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { paypalMcpEnvironment } from "./paypal-mcp-env.mts";

const unexpectedRequest: typeof fetch = async () => assert.fail("No network request expected");
const noFile = () => assert.fail("No environment file should be read");

test("preserves the working Codex token flow without reading any environment file", async () => {
  const environment = await paypalMcpEnvironment(
    {
      PAYPAL_ACCESS_TOKEN: "example-token",
      PAYPAL_ENVIRONMENT: "SANDBOX",
      PAYPAL_CLIENT_SECRET: "example-secret",
    },
    noFile,
    unexpectedRequest,
  );
  assert.equal(environment.PAYPAL_ACCESS_TOKEN, "example-token");
  assert.equal(environment.PAYPAL_CLIENT_SECRET, undefined);
});

test("gets a sandbox token from local credentials when the editor supplies no token", async () => {
  let loaded = false;
  let calls = 0;
  const environment = await paypalMcpEnvironment(
    {
      PATH: "example-path",
      PAYPAL_ACCESS_TOKEN: "",
      PAYPAL_ENVIRONMENT: "SANDBOX",
    },
    (path) => {
      loaded = true;
      assert.ok(isAbsolute(path));
      assert.equal(path, resolve(dirname(fileURLToPath(import.meta.url)), "../.env"));
      return {
        PAYPAL_CLIENT_ID: "example-client",
        PAYPAL_CLIENT_SECRET: "example-secret",
        DATABASE_URL: "not-forwarded",
      };
    },
    async (url, options) => {
      calls++;
      assert.equal(url, "https://api-m.sandbox.paypal.com/v1/oauth2/token");
      assert.equal(options?.method, "POST");
      return Response.json({ access_token: "example-token", token_type: "Bearer" });
    },
  );
  assert.equal(loaded, true);
  assert.equal(calls, 1);
  assert.equal(environment.PAYPAL_ACCESS_TOKEN, "example-token");
  assert.equal(environment.PAYPAL_ENVIRONMENT, "SANDBOX");
  assert.equal(environment.PAYPAL_CLIENT_SECRET, undefined);
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.PATH, "example-path");
});

test("accepts file-only tokens without a network request", async () => {
  const environment = await paypalMcpEnvironment(
    {},
    () => ({ PAYPAL_ACCESS_TOKEN: "example-token" }),
    unexpectedRequest,
  );
  assert.equal(environment.PAYPAL_ACCESS_TOKEN, "example-token");
});

test("uses inherited client credentials without requiring a file", async () => {
  const environment = await paypalMcpEnvironment(
    {
      PAYPAL_CLIENT_ID: "example-client",
      PAYPAL_CLIENT_SECRET: "example-secret",
    },
    noFile,
    async () => Response.json({ access_token: "example-token", token_type: "Bearer" }),
  );
  assert.equal(environment.PAYPAL_ACCESS_TOKEN, "example-token");
});

test("fails closed for production and missing credentials without making requests", async () => {
  await assert.rejects(
    paypalMcpEnvironment({ PAYPAL_ENVIRONMENT: "PRODUCTION" }, noFile, unexpectedRequest),
    /only supports.*SANDBOX/,
  );
  await assert.rejects(
    paypalMcpEnvironment({}, () => ({ PAYPAL_ENVIRONMENT: "PRODUCTION" }), unexpectedRequest),
    /only supports.*SANDBOX/,
  );
  await assert.rejects(
    paypalMcpEnvironment({}, () => ({}), unexpectedRequest),
    /Set PAYPAL_CLIENT_ID/,
  );
});
