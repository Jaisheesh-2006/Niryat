import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractPdfText, parseFiraText } from "./fira";

const sample = new URL("../../../.tmp/fira/fira-sample.pdf", import.meta.url);

describe.skipIf(!existsSync(sample))(
  "local FIRA sample (synthetic until a real layout is verified)",
  () => {
    it("extracts lines with every required field without logging their values", async () => {
      const result = parseFiraText(await extractPdfText(await readFile(sample)));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lines.length > 0).toBe(true);
      expect(
        result.lines.every((line) =>
          Boolean(line.date && line.amount && line.currency && line.reference),
        ),
      ).toBe(true);
    });
  },
);
