import { type ClaudeRunner, runExtraction } from "@niryat/agent";
import {
  aiSpendSince,
  type Db,
  finishAgentRun,
  listClients,
  logToolCall,
  startAgentRun,
} from "@niryat/db";
import {
  clientInputSchema,
  type ExtractionResult,
  extractionFieldNames,
  extractionResultSchema,
  invoiceCurrencies,
  invoiceInputSchema,
  recurrenceSchema,
} from "@niryat/shared";
import { z } from "zod";
import { indiaDate } from "./rules";

export interface AiDeps {
  runner: ClaudeRunner;
  monthlyBudgetUsd: string;
}

const fieldSchemas = {
  clientName: clientInputSchema.shape.name,
  clientEmail: clientInputSchema.shape.email,
  clientAddress: clientInputSchema.shape.address,
  clientCountry: z.string().regex(/^[A-Z]{2}$/),
  description: invoiceInputSchema.shape.description,
  currency: invoiceInputSchema.shape.currency,
  amount: invoiceInputSchema.shape.amount,
  invoiceType: invoiceInputSchema.shape.type,
  intervalUnit: recurrenceSchema.shape.intervalUnit,
};
const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
const shortCurrencyLabels = "US|EU|GB|UK|AU|CA|A|C";
// Spaced short labels require uppercase so articles and pronouns remain ordinary text.
const negativeCurrencyPrefix = new RegExp(
  `[\\p{Pd}−]\\s*(?:(?:${invoiceCurrencies.join("|")})\\s*|(?:(?:${shortCurrencyLabels})|(?-i:${shortCurrencyLabels})\\s+)?\\p{Sc}\\s*)+$`,
  "iu",
);

function valueInSource(
  text: string,
  source: string,
  value: string,
  field: "amount" | "clientEmail",
) {
  const input = field === "amount" ? text : text.toLowerCase();
  const quote = field === "amount" ? source : source.toLowerCase();
  const tokens =
    field === "amount"
      ? /(?<![\p{L}\p{N}\p{M}_.,+\p{Pd}−])(?:[+\p{Pd}−]\s*)?\d+(?:,\d+)*(?:\.\d+)?(?![\p{L}\p{N}\p{M}_]|[.,]\d|,,)/gu
      : /(?<![\p{L}\p{N}\p{M}_.!#$%&'*+/=?^`{|}~@-])[\w.!#$%&'*+/=?^`{|}~-]+@[\w](?:[\w.-]*[\w])?(?![\p{L}\p{N}\p{M}_@-]|\.[\p{L}\p{N}\p{M}_.-])/gu;
  for (const token of input.matchAll(tokens)) {
    if (
      field === "amount" &&
      !/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?$/.test(token[0])
    )
      continue;
    const normalized = field === "amount" ? token[0].replaceAll(",", "") : token[0];
    if (normalized !== value) continue;
    if (field === "amount" && negativeCurrencyPrefix.test(input.slice(0, token.index))) continue;
    // Check the full text so a source quote cannot cut off a sign, digit or email prefix.
    const start = input.indexOf(quote, Math.max(0, token.index + token[0].length - quote.length));
    if (start !== -1 && start <= token.index) return true;
  }
  return false;
}

export function verifyExtraction(text: string, raw: unknown) {
  const object = z.record(z.string(), z.unknown()).safeParse(raw);
  const fields = extractionResultSchema.shape.fields.parse(
    Object.fromEntries(extractionFieldNames.map((name) => [name, { value: null, source: null }])),
  );
  const found: string[] = [];
  const dropped: string[] = [];
  const field = z.strictObject({ value: z.string(), source: z.string().min(1).max(300) });
  for (const name of extractionFieldNames) {
    const input = object.success ? object.data[name] : undefined;
    const pair = field.safeParse(input);
    if (!pair.success) {
      const absent = z.strictObject({ value: z.null(), source: z.null() }).safeParse(input);
      if (input !== undefined && !absent.success) dropped.push(name);
      continue;
    }
    const value = fieldSchemas[name].safeParse(pair.data.value);
    const quote = collapse(pair.data.source);
    const supported =
      value.success &&
      typeof value.data === "string" &&
      quote.length > 0 &&
      collapse(text).includes(quote) &&
      ((name !== "clientEmail" && name !== "amount") ||
        valueInSource(collapse(text), quote, value.data, name)) &&
      (name !== "intervalUnit" || fields.invoiceType.value === "recurring");
    if (supported && value.success && typeof value.data === "string") {
      fields[name] = { value: value.data, source: pair.data.source };
      found.push(name);
    } else dropped.push(name);
  }
  return { fields, found, dropped };
}

export async function extractInvoice(
  deps: { db: Db; encryptionKey: Buffer; ai?: AiDeps },
  userId: string,
  text: string,
  now: Date,
): Promise<
  | { ok: true; result: ExtractionResult }
  | {
      ok: false;
      reason: "ai_unavailable" | "ai_budget_exhausted" | "extraction_running" | "extraction_failed";
    }
> {
  if (!deps.ai) return { ok: false, reason: "ai_unavailable" };
  const asOf = indiaDate(now);
  const month = asOf.slice(0, 7);
  const spent = await aiSpendSince(deps.db, new Date(`${month}-01T00:00:00+05:30`));
  const remaining = Number(deps.ai.monthlyBudgetUsd) - Number(spent);
  if (remaining <= 0) return { ok: false, reason: "ai_budget_exhausted" };
  const started = await startAgentRun(
    deps.db,
    { userId, kind: "extraction", trigger: "manual", month, asOf },
    now,
  );
  if (!started.ok) return { ok: false, reason: "extraction_running" };
  const maxBudgetUsd = Math.min(remaining, 0.1);
  let costUsd = maxBudgetUsd.toFixed(4);
  let aiStatus: "used" | "failed" | "budget_exhausted" = "failed";
  let result: ExtractionResult | undefined;
  try {
    const extracted = await runExtraction(deps.ai.runner, text, {
      maxBudgetUsd,
      log: (call) => logToolCall(deps.db, started.runId, { ...call, actor: "agent" }),
    });
    costUsd = extracted.costUsd;
    aiStatus = extracted.status;
    if (extracted.status === "used" && extracted.raw !== null) {
      const verified = verifyExtraction(text, extracted.raw);
      await logToolCall(deps.db, started.runId, {
        actor: "system",
        tool: "verify_extraction",
        input: { fields: extractionFieldNames },
        output: { found: verified.found, dropped: verified.dropped },
        ok: true,
      });
      const email = verified.fields.clientEmail.value;
      const clients = email ? await listClients(deps.db, userId, deps.encryptionKey) : [];
      result = extractionResultSchema.parse({
        fields: verified.fields,
        matchedClientId:
          clients.find((client) => client.email?.toLowerCase() === email)?.id ?? null,
      });
    }
  } catch {
    aiStatus = "failed";
  }
  await finishAgentRun(deps.db, started.runId, {
    status: result ? "completed" : "failed",
    error: result ? null : "extraction_failed",
    summary: null,
    aiStatus,
    aiCostUsd: costUsd,
  });
  return result ? { ok: true, result } : { ok: false, reason: "extraction_failed" };
}
