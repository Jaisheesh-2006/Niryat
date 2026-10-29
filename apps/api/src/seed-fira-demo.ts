// Demo data only: mirrors a real FIRA's lines so matching can be shown against the sandbox. Run on a dedicated demo account.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseEnv } from "@niryat/config";
import { createDb, type Db, findUserByEmail, insertDemoLedger } from "@niryat/db";
import { checkExportConditions, invoiceNumberFor } from "@niryat/rules";
import { invoiceInputSchema } from "@niryat/shared";
import { z } from "zod";
import { extractPdfText, type ParsedFiraLine, parseFiraText } from "./fira";
import { rules, todayInIndia } from "./rules";

export async function seedFiraDemo(
  db: Db,
  userId: string,
  lines: readonly ParsedFiraLine[],
): Promise<
  | { ok: true; invoices: number; flaggedLine: number }
  | { ok: false; reason: "has_invoices" | "no_lines" | "invalid_lines" }
> {
  const flagged = lines.at(-1);
  if (!flagged) return { ok: false, reason: "no_lines" };
  const mirroredLines = lines.slice(0, -1);
  if (
    mirroredLines.some(
      (line) =>
        !invoiceInputSchema.shape.currency.safeParse(line.currency).success ||
        !invoiceInputSchema.shape.amount.safeParse(line.amount).success,
    )
  ) {
    return { ok: false, reason: "invalid_lines" };
  }
  const answers = {
    supplierInIndia: true,
    clientPresentInIndia: false,
    paidInForeignCurrency: true,
    sameEstablishment: false,
  };
  const result = await insertDemoLedger(
    db,
    userId,
    {
      client: {
        name: "FIRA demo client",
        country: "US",
        exportCheckResult: {
          answers,
          result: checkExportConditions(
            { country: "US", answers },
            { today: todayInIndia(), rules },
          ),
        },
      },
      items: mirroredLines.map((line, index) => {
        const receivedAt = new Date(`${line.date}T12:00:00+05:30`);
        if (index === 0) receivedAt.setUTCDate(receivedAt.getUTCDate() + 2);
        return {
          date: line.date,
          currency: line.currency,
          amount: line.amount,
          description: `Demo invoice mirroring FIRA line ${line.position}`,
          sac: "998314",
          paypalTxnId: index === 0 ? "DEMO-1" : line.reference,
          receivedAt,
        };
      }),
    },
    invoiceNumberFor,
  );
  return result.ok ? { ...result, flaggedLine: flagged.position } : result;
}

export async function main(args: string[] = []) {
  let input: { email: string; file: string };
  try {
    const { values } = parseArgs({
      args: args[0] === "--" ? args.slice(1) : args,
      options: { email: { type: "string" }, file: { type: "string" } },
      allowPositionals: false,
    });
    input = z
      .object({ email: z.string().trim().toLowerCase().pipe(z.email()), file: z.string().min(1) })
      .parse(values);
  } catch {
    console.error("Invalid arguments: email, file. Use --email <demo account> --file <path>.");
    process.exitCode = 1;
    return;
  }
  try {
    try {
      process.loadEnvFile(resolve("../../.env"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const { DATABASE_URL } = parseEnv(z.object({ DATABASE_URL: z.url() }), process.env);
    let parsed: ReturnType<typeof parseFiraText>;
    try {
      // pnpm runs in apps/api; the documented file path is relative to the repository root.
      const bytes = new Uint8Array(await readFile(resolve("../../", input.file)));
      parsed = parseFiraText(await extractPdfText(bytes));
    } catch {
      parsed = { ok: false };
    }
    if (!parsed.ok || parsed.lines.length === 0) {
      console.error("Could not read FIRA lines");
      process.exitCode = 1;
      return;
    }
    const database = createDb(DATABASE_URL);
    try {
      const user = await findUserByEmail(database.db, input.email);
      if (!user) {
        console.error("No account with that email");
        process.exitCode = 1;
        return;
      }
      const result = await seedFiraDemo(database.db, user.id, parsed.lines);
      if (!result.ok) {
        console.error(
          result.reason === "has_invoices"
            ? "The demo seed needs an account with no invoices"
            : "Could not read FIRA lines",
        );
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify({ invoices: result.invoices, flaggedLine: result.flaggedLine }));
    } finally {
      await database.close();
    }
  } catch {
    console.error("FIRA demo seed failed; check DATABASE_URL");
    process.exitCode = 1;
  }
}

if (import.meta.main) void main(process.argv.slice(2));
