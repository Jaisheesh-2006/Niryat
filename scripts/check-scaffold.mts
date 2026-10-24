import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const plan = read("docs/PLAN.md");
const expected = plan
  .split("## 5. v1 features")[1]
  ?.split("## 6. Stretch")[0]
  ?.split(/\r?\n/)
  .filter((line) => line.startsWith("- [ ]"));
const specs = readdirSync(resolve(root, "docs/specs")).sort();
assert.equal(specs.length, 13);
const actual = specs.flatMap((path) =>
  read(`docs/specs/${path}`)
    .split("\n")
    .filter((line) => line.startsWith("- [ ]")),
);
assert.deepEqual(actual, expected, "Acceptance criteria must match PLAN verbatim");
assert.ok(read("AGENTS.md").trimEnd().split("\n").length < 150);
assert.ok(read("README.md").trimEnd().split("\n").length < 120);
for (const path of ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"])
  assert.ok(read(path).includes("AGENTS.md"));
const ruleSection = plan.split("## 9. Rules engine")[1]?.split("## 10.")[0] ?? "";
const ids = [...ruleSection.matchAll(/\| `([A-Z_0-9]+)`/g)].map((match) => match[1]);
const yaml = read("packages/rules/rules/india-export.yaml");
assert.deepEqual(
  [...yaml.matchAll(/- id: ([A-Z_0-9]+)/g)].map((match) => match[1]),
  ids,
);
assert.equal([...yaml.matchAll(/verified: false/g)].length, 12);
assert.equal([...yaml.matchAll(/logic: TODO/g)].length, 12);
for (const line of read(".env.example")
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))) {
  const [key, value] = line.split("=");
  assert.equal(
    value,
    key === "PAYPAL_ENVIRONMENT" ? "SANDBOX" : "",
    "Template values must be empty",
  );
}
const excluded = new Set(["node_modules", ".git", ".next", ".turbo", "dist", "coverage", ".tmp"]);
function inspect(path: string) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    assert.ok(!entry.name.toLowerCase().includes("cursor"), "No Cursor configuration");
    assert.ok(!entry.isSymbolicLink(), "No repository symlinks");
    if (entry.isDirectory()) inspect(resolve(path, entry.name));
  }
}
inspect(root);
console.log(
  "Scaffold checks passed: 13 specs, 42 exact criteria, 12 inert rules, short instructions, empty template values, no Cursor files/symlinks.",
);
