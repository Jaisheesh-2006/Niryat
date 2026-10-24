import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const schema = z.object({
  tool_input: z.object({ file_path: z.string().optional(), notebook_path: z.string().optional() }),
});
try {
  const payload = schema.parse(JSON.parse(readFileSync(0, "utf8")));
  const path = payload.tool_input.file_path ?? payload.tool_input.notebook_path;
  if (!path) throw new Error("Missing edited-file path.");
  const segments = path.replaceAll("\\", "/").split("/");
  const isEnv = segments.some((part) => part.startsWith(".env"));
  if (mode === "block-env") {
    if (isEnv) {
      console.error("Edits to .env* are blocked. The user manages environment values.");
      process.exit(2);
    }
  } else if (mode === "format") {
    if (isEnv || !existsSync(path)) process.exit(0);
    const target = realpathSync(resolve(root, path));
    const local = relative(root, target);
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) process.exit(0);
    if (
      local
        .split(sep)
        .some((part) =>
          ["node_modules", ".git", ".next", "dist", "coverage", ".turbo"].includes(part),
        )
    )
      process.exit(0);
    const biome = resolve(root, "node_modules/@biomejs/biome/bin/biome");
    const result = spawnSync(
      process.execPath,
      [biome, "check", "--write", "--no-errors-on-unmatched", target],
      { cwd: root, stdio: "inherit", shell: false },
    );
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  } else {
    throw new Error("Unknown hook mode.");
  }
} catch {
  // Never print the payload or parse errors: input may contain credentials.
  console.error("Hook input or execution failed; inspect the hook configuration.");
  process.exit(mode === "block-env" ? 2 : 1);
}
