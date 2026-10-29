import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";

export const FIRA_DATE_WINDOW_DAYS = 7;
export const FIRA_AUTO_MATCH_CONFIDENCE = "0.90";

export interface ParsedFiraLine {
  position: number;
  date: string;
  amount: string;
  currency: string;
  reference: string;
  purposeCode: string | null;
  sourceText: string;
}

export interface FiraCandidate {
  paymentId: string;
  paypalTxnId: string;
  gross: string;
  net: string | null;
  currency: string;
  receivedDate: string;
}

export interface FiraMatchResult {
  position: number;
  paymentId: string | null;
  confidence: string | null;
  note: string | null;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    try {
      return z.object({ text: z.string() }).parse(await extractText(pdf, { mergePages: true }))
        .text;
    } finally {
      await pdf.loadingTask.destroy();
    }
  } catch {
    throw new Error("Could not extract PDF text");
  }
}

function normaliseAmount(value: string): string | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.replaceAll(",", "").split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

function parseDate(value: string | undefined): string | null {
  const parts = value?.match(/^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/);
  if (!parts) return null;
  const [, day, month = "", year] = parts;
  const monthIndex = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(month);
  if (monthIndex === -1) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day}`;
}

const parsedLineSchema = z.object({
  position: z.number().int().positive(),
  date: z.iso.date(),
  amount: z.string().regex(/^\d+\.\d{2}$/),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine((value) => Intl.supportedValuesOf("currency").includes(value)),
  reference: z
    .string()
    .min(1)
    .refine((value) => !/^P\d{4}$/.test(value)),
  purposeCode: z
    .string()
    .regex(/^P\d{4}$/)
    .nullable(),
  sourceText: z.string().min(1),
});

export function parseFiraText(text: string): { ok: true; lines: ParsedFiraLine[] } | { ok: false } {
  // shortcut: supports only the authorised synthetic table, replace after a real FIRA layout is verified.
  const rows = text.split(/\r?\n/).map((row) => row.trim());
  const header = rows.findIndex(
    (row) =>
      row.replace(/\s+/g, " ") ===
      "Line Date Foreign amount Currency Remittance reference Purpose code INR / FX",
  );
  if (header === -1) return { ok: false };
  const countRow = rows.slice(0, header).find((row) => row.startsWith("Remittance lines:"));
  const count = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(countRow?.match(/^Remittance lines:\s*(\d+)$/)?.[1]);
  if (!count.success) return { ok: false };
  const lines: ParsedFiraLine[] = [];
  for (const sourceText of rows.slice(header + 1)) {
    if (sourceText === "Layout notes") break;
    if (!sourceText) continue;
    const fields = sourceText.match(
      /^\d+\s+(\S+)\s+(\S+)\s+([A-Z]{3})\s+(\S+)\s+(?:(P\d{4})\s+)?Not shown$/,
    );
    if (!fields) return { ok: false };
    const [, date, amount, currency, reference, purposeCode] = fields;
    const result = parsedLineSchema.safeParse({
      position: lines.length + 1,
      date: parseDate(date),
      amount: amount === undefined ? null : normaliseAmount(amount),
      currency,
      reference,
      purposeCode: purposeCode ?? null,
      sourceText,
    });
    if (!result.success) return { ok: false };
    lines.push(result.data);
  }
  return lines.length === count.data ? { ok: true, lines } : { ok: false };
}

function sameAmount(line: ParsedFiraLine, candidate: FiraCandidate): boolean {
  const amount = normaliseAmount(line.amount);
  return (
    amount !== null &&
    line.currency === candidate.currency &&
    (amount === normaliseAmount(candidate.gross) ||
      (candidate.net !== null && amount === normaliseAmount(candidate.net)))
  );
}

function gap(line: ParsedFiraLine, candidate: FiraCandidate): number {
  return Math.abs(Date.parse(line.date) - Date.parse(candidate.receivedDate)) / 86_400_000;
}

export function matchFiraLines(
  lines: readonly ParsedFiraLine[],
  candidates: readonly FiraCandidate[],
): FiraMatchResult[] {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const used = new Set<string>();
  const matches = new Map<number, FiraMatchResult>();
  for (const line of ordered) {
    const candidate = candidates.find(
      (c) => !used.has(c.paymentId) && c.paypalTxnId === line.reference,
    );
    if (!candidate) continue;
    const exact = sameAmount(line, candidate);
    matches.set(line.position, {
      position: line.position,
      paymentId: candidate.paymentId,
      confidence: exact ? "1.00" : "0.60",
      note: exact
        ? null
        : "Reference matches, but the amount or currency differs from the PayPal payment.",
    });
    used.add(candidate.paymentId);
  }
  for (const line of ordered) {
    if (matches.has(line.position)) continue;
    const pool = candidates
      .filter(
        (c) =>
          !used.has(c.paymentId) && sameAmount(line, c) && gap(line, c) <= FIRA_DATE_WINDOW_DAYS,
      )
      .sort(
        (a, b) =>
          gap(line, a) - gap(line, b) ||
          a.receivedDate.localeCompare(b.receivedDate) ||
          (a.paypalTxnId < b.paypalTxnId ? -1 : a.paypalTxnId > b.paypalTxnId ? 1 : 0),
      );
    const candidate = pool[0];
    if (!candidate) continue;
    matches.set(line.position, {
      position: line.position,
      paymentId: candidate.paymentId,
      confidence: pool.length === 1 ? "0.70" : "0.50",
      note:
        pool.length === 1
          ? "Matched on amount, currency and date only. Confirm this is the right payment."
          : `${pool.length} payments match the amount, currency and date. Confirm this is the right one.`,
    });
    used.add(candidate.paymentId);
  }
  return ordered.map(
    (line) =>
      matches.get(line.position) ?? {
        position: line.position,
        paymentId: null,
        confidence: null,
        note: `No PayPal payment in your ledger matches this amount and currency within 7 days of ${line.date}.`,
      },
  );
}
