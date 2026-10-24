import assert from "node:assert/strict";
import { test } from "node:test";
import { clientLaunch, codexEnvironment, getSandboxToken } from "./start-codex-paypal.mts";

const credentials = {
  PAYPAL_CLIENT_ID: "example-client",
  PAYPAL_CLIENT_SECRET: "example-secret",
  PAYPAL_ENVIRONMENT: "SANDBOX",
};

test("keeps Codex as default and supports fixed Claude/VS Code launches on Windows and Linux", () => {
  assert.deepEqual(clientLaunch(undefined, "win32"), {
    client: "codex",
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "codex.cmd"],
  });
  assert.deepEqual(clientLaunch("claude", "win32"), {
    client: "claude",
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "claude.cmd"],
  });
  assert.deepEqual(clientLaunch("vscode", "win32"), {
    client: "vscode",
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "code.cmd --new-window ."],
  });
  assert.deepEqual(clientLaunch("codex", "linux"), {
    client: "codex",
    command: "codex",
    args: [],
  });
  assert.deepEqual(clientLaunch("claude", "linux"), {
    client: "claude",
    command: "claude",
    args: [],
  });
  assert.deepEqual(clientLaunch("vscode", "linux"), {
    client: "vscode",
    command: "code",
    args: ["--new-window", "."],
  });
  assert.throws(() => clientLaunch("claude & unexpected-command", "win32"), /Choose a client/);
});

test("exchanges credentials only at the sandbox endpoint", async () => {
  let calls = 0;
  const token = await getSandboxToken(credentials, async (url, options) => {
    calls++;
    assert.equal(url, "https://api-m.sandbox.paypal.com/v1/oauth2/token");
    assert.equal(options?.method, "POST");
    assert.equal(options?.redirect, "error");
    assert.equal(String(options?.body), "grant_type=client_credentials");
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      `Basic ${Buffer.from("example-client:example-secret").toString("base64")}`,
    );
    return Response.json({ access_token: "example-token", token_type: "Bearer" });
  });
  assert.equal(token, "example-token");
  assert.equal(calls, 1);
});

test("rejects missing credentials and production before making requests", async () => {
  const unexpectedRequest: typeof fetch = async () => {
    assert.fail("Network must not be called");
  };
  await assert.rejects(getSandboxToken({}, unexpectedRequest), /sandbox app credentials/);
  await assert.rejects(
    getSandboxToken({ ...credentials, PAYPAL_ENVIRONMENT: "PRODUCTION" }, unexpectedRequest),
    /SANDBOX/,
  );
});

test("redacts remote failures and validates token responses", async () => {
  await assert.rejects(
    getSandboxToken(
      credentials,
      async () => new Response("example-sensitive-value", { status: 401 }),
    ),
    {
      message:
        "PayPal sandbox authentication failed (HTTP 401). Check your sandbox app credentials.",
    },
  );
  await assert.rejects(
    getSandboxToken(credentials, async () => Response.json({ access_token: "example-token" })),
    /invalid token response/,
  );
  await assert.rejects(
    getSandboxToken(credentials, async () => {
      throw new Error("example-sensitive-value");
    }),
    { message: "Unable to reach PayPal sandbox authentication. Check your network and retry." },
  );
});

test("passes only the short-lived PayPal token to Codex and preserves the parent environment", () => {
  const parent = { ...credentials, PATH: "example-path" };
  const child = codexEnvironment(parent, "example-token");
  assert.equal(child.PAYPAL_CLIENT_ID, undefined);
  assert.equal(child.PAYPAL_CLIENT_SECRET, undefined);
  assert.equal(child.PAYPAL_ACCESS_TOKEN, "example-token");
  assert.equal(child.PAYPAL_ENVIRONMENT, "SANDBOX");
  assert.equal(child.PATH, "example-path");
  assert.equal(parent.PAYPAL_CLIENT_SECRET, "example-secret");
});
