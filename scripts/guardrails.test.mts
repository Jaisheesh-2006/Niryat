import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hook = resolve(root, "scripts/claude-hook.mts");
function runHook(mode: string, input: unknown) {
  return spawnSync(process.execPath, [hook, mode], {
    cwd: root,
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}
test("blocks env edits across Windows and POSIX paths, including the template", () => {
  for (const path of [
    "C:/repo/.env",
    "C:\\repo\\.env.production",
    "/repo/.env.local",
    ".env.example",
    "folder/.env/secret",
  ]) {
    assert.equal(runHook("block-env", { tool_input: { file_path: path } }).status, 2, path);
  }
  assert.equal(
    runHook("block-env", { tool_input: { file_path: "apps/api/src/index.ts" } }).status,
    0,
  );
  assert.equal(runHook("block-env", {}).status, 2);
});
test("formats edited files with the installed Biome executable", () => {
  const temporary = mkdtempSync(resolve(root, "hook-test-"));
  try {
    const file = resolve(temporary, "example.ts");
    writeFileSync(file, "export const value={answer:42};");
    const result = runHook("format", { tool_input: { file_path: file } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(file, "utf8"), /answer: 42/);
  } finally {
    // Only remove the exact, freshly created fixture; never recursively delete paths.
    rmSync(resolve(temporary, "example.ts"));
    rmdirSync(temporary);
  }
});
test("MCP launcher refuses missing tokens and production before spawning npx", () => {
  for (const environment of ["SANDBOX", "PRODUCTION"]) {
    const result = spawnSync(process.execPath, [resolve(root, "scripts/paypal-mcp.mts")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PAYPAL_ACCESS_TOKEN: "", PAYPAL_ENVIRONMENT: environment },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires PAYPAL_ACCESS_TOKEN/);
  }
});
