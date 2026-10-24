import { spawn } from "node:child_process";
import { z } from "zod";

// Exact command from https://developer.paypal.com/ai-tools/mcp-server
// Original prompt URL migration and live clients: docs/verification.md V01/V12.
const environment = z
  .object({
    PAYPAL_ACCESS_TOKEN: z.string().trim().min(1),
    PAYPAL_ENVIRONMENT: z.literal("SANDBOX").default("SANDBOX"),
  })
  .safeParse(process.env);
if (!environment.success) {
  console.error(
    "PayPal MCP requires PAYPAL_ACCESS_TOKEN and PAYPAL_ENVIRONMENT=SANDBOX in the parent environment.",
  );
  process.exit(1);
}
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
    env: { ...process.env, ...environment.data, PAYPAL_ENVIRONMENT: "SANDBOX" },
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
