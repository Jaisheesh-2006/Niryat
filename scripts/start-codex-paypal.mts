import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const credentialsSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().trim().min(1),
  PAYPAL_CLIENT_SECRET: z.string().trim().min(1),
  PAYPAL_ENVIRONMENT: z.literal("SANDBOX").default("SANDBOX"),
});
const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.literal("Bearer") });
const clientSchema = z.enum(["codex", "claude", "vscode"]).default("codex");

export function clientLaunch(input: unknown, platform: NodeJS.Platform = process.platform) {
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) throw new Error("Choose a client: codex, claude or vscode.");
  const client = parsed.data;
  const windows = platform === "win32";
  const command = client === "vscode" ? "code" : client;
  // Only fixed commands reach cmd.exe; no user-supplied command text is interpolated.
  const windowsCommands = {
    codex: "codex.cmd",
    claude: "claude.cmd",
    vscode: "code.cmd --new-window .",
  };
  return {
    client,
    command: windows ? "cmd.exe" : command,
    args: windows
      ? ["/d", "/s", "/c", windowsCommands[client]]
      : client === "vscode"
        ? ["--new-window", "."]
        : [],
  };
}

// Run locally: node --env-file=.env scripts/start-codex-paypal.mts [codex|claude|vscode]
// Only this explicit user command loads .env. Tests never load environment files.
// https://developer.paypal.com/api/rest/authentication/
export async function getSandboxToken(
  input: unknown,
  request: typeof fetch = fetch,
): Promise<string> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to sandbox app credentials and PAYPAL_ENVIRONMENT=SANDBOX in your private .env.",
    );
  }
  const credentials = parsed.data;
  const basic = Buffer.from(
    `${credentials.PAYPAL_CLIENT_ID}:${credentials.PAYPAL_CLIENT_SECRET}`,
    "utf8",
  ).toString("base64");
  let response: Response;
  try {
    response = await request("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new Error("Unable to reach PayPal sandbox authentication. Check your network and retry.");
  }
  if (!response.ok) {
    throw new Error(
      `PayPal sandbox authentication failed (HTTP ${response.status}). Check your sandbox app credentials.`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("PayPal sandbox returned an invalid token response.");
  }
  const token = tokenSchema.safeParse(body);
  if (!token.success) throw new Error("PayPal sandbox returned an invalid token response.");
  return token.data.access_token;
}

export function codexEnvironment(input: NodeJS.ProcessEnv, token: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...input,
    PAYPAL_ACCESS_TOKEN: token,
    PAYPAL_ENVIRONMENT: "SANDBOX",
  };
  // The MCP launcher needs the short-lived token, not the client credentials.
  delete environment.PAYPAL_CLIENT_ID;
  delete environment.PAYPAL_CLIENT_SECRET;
  return environment;
}

if (import.meta.main) {
  try {
    const launch = clientLaunch(process.argv[2]);
    const token = await getSandboxToken(process.env);
    console.log(`Sandbox authentication succeeded. Starting ${launch.client}.`);
    if (launch.client === "vscode") {
      console.log(
        "VS Code must be fully closed first to inherit this token. Check MCP: List Servers.",
      );
    } else {
      console.log("Check PayPal's connection with /mcp in the new session.");
    }
    const child = spawn(launch.command, launch.args, {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      env: codexEnvironment(process.env, token),
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.once("error", () => {
      console.error(
        `Unable to start ${launch.client}. Ensure its command is installed and on PATH.`,
      );
      process.exitCode = 1;
    });
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
    });
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => child.kill(signal));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Sandbox authentication failed.");
    process.exitCode = 1;
  }
}
