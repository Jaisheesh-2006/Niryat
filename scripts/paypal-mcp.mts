import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { paypalMcpEnvironment } from "./paypal-mcp-env.mts";

// Exact command from https://developer.paypal.com/ai-tools/mcp-server
// Original prompt URL migration and live clients: docs/verification.md V01/V12.
try {
  const environment = await paypalMcpEnvironment(process.env);
  const windows = process.platform === "win32";
  // Windows npx.cmd needs cmd.exe; the command is fixed and contains no user input.
  const child = spawn(
    windows ? "cmd.exe" : "npx",
    windows
      ? ["/d", "/s", "/c", "npx -y @paypal/mcp --tools=all"]
      : ["-y", "@paypal/mcp", "--tools=all"],
    {
      shell: false,
      stdio: "inherit",
      windowsHide: true,
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      env: environment,
    },
  );
  child.once("error", () => {
    console.error("Unable to start PayPal MCP. Check Node/npm installation.");
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => child.kill(signal));
  }
} catch (error) {
  // MCP stdout is reserved for protocol messages; never print credentials or tokens.
  console.error(error instanceof Error ? error.message : "PayPal MCP startup failed.");
  process.exitCode = 1;
}
