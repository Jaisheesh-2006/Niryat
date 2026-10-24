import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { z } from "zod";
import { codexEnvironment, getSandboxToken } from "./start-codex-paypal.mts";

const fields = z.object({
  PAYPAL_CLIENT_ID: z.string().trim().optional(),
  PAYPAL_CLIENT_SECRET: z.string().trim().optional(),
  PAYPAL_ACCESS_TOKEN: z.string().trim().optional(),
  PAYPAL_ENVIRONMENT: z.string().trim().optional(),
});
const localPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");

// Only invoked when the user starts their MCP server. Tests inject a fake loader.
function readLocalCredentials(path: string): unknown {
  try {
    return parseEnv(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw new Error(
      "Unable to load local PayPal configuration. Check .env syntax and permissions.",
    );
  }
}

function validate(input: unknown) {
  const result = fields.safeParse(input);
  if (!result.success) throw new Error("Invalid PayPal configuration; expected string values.");
  if (result.data.PAYPAL_ENVIRONMENT && result.data.PAYPAL_ENVIRONMENT !== "SANDBOX") {
    throw new Error("PayPal MCP only supports PAYPAL_ENVIRONMENT=SANDBOX.");
  }
  return result.data;
}

export async function paypalMcpEnvironment(
  parent: NodeJS.ProcessEnv,
  loadLocal: (path: string) => unknown = readLocalCredentials,
  request: typeof fetch = fetch,
): Promise<NodeJS.ProcessEnv> {
  const inherited = validate(parent);
  if (inherited.PAYPAL_ACCESS_TOKEN) {
    return codexEnvironment(parent, inherited.PAYPAL_ACCESS_TOKEN);
  }
  const local =
    inherited.PAYPAL_CLIENT_ID && inherited.PAYPAL_CLIENT_SECRET
      ? validate({})
      : validate(loadLocal(localPath));
  // Empty editor substitutions must not mask configured local credentials.
  const credentials = {
    PAYPAL_CLIENT_ID: inherited.PAYPAL_CLIENT_ID || local.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: inherited.PAYPAL_CLIENT_SECRET || local.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENVIRONMENT: "SANDBOX",
  };
  const token = local.PAYPAL_ACCESS_TOKEN || (await getSandboxToken(credentials, request));
  // Forward the parent environment and the token, not other secrets from the file.
  return codexEnvironment(parent, token);
}
