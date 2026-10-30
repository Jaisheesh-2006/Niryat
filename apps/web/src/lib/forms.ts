import { z } from "zod";

export function text(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() || null : null;
}

export function yesNo(form: FormData, name: string): boolean | null {
  const value = form.get(name);
  return value === "yes" ? true : value === "no" ? false : null;
}

export function wholeNumber(form: FormData, name: string): number | string | null {
  const value = text(form, name);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function profileBody(form: FormData): Record<string, unknown> {
  return {
    gstRegistered: yesNo(form, "gstRegistered"),
    legalName: text(form, "legalName"),
    address: text(form, "address"),
    gstin: text(form, "gstin"),
    lutNumber: text(form, "lutNumber"),
    lutValidFrom: text(form, "lutValidFrom"),
    lutValidTo: text(form, "lutValidTo"),
    workType: text(form, "workType"),
    purposeCode: text(form, "purposeCode"),
    panLast4: text(form, "panLast4"),
    expectedTurnoverInr: wholeNumber(form, "expectedTurnoverInr"),
  };
}

export function clientBody(form: FormData): Record<string, unknown> {
  return {
    name: text(form, "name"),
    country: text(form, "country"),
    email: text(form, "email"),
    address: text(form, "address"),
    answers: {
      supplierInIndia: yesNo(form, "supplierInIndia"),
      clientPresentInIndia: yesNo(form, "clientPresentInIndia"),
      paidInForeignCurrency: yesNo(form, "paidInForeignCurrency"),
      sameEstablishment: yesNo(form, "sameEstablishment"),
    },
  };
}

export function invoiceBody(form: FormData): Record<string, unknown> {
  const type = text(form, "type");
  return {
    clientId: text(form, "clientId"),
    type,
    description: text(form, "description"),
    sac: text(form, "sac"),
    currency: text(form, "currency"),
    amount: text(form, "amount"),
    recurrence:
      type === "recurring"
        ? {
            intervalUnit: text(form, "intervalUnit"),
            intervalCount: wholeNumber(form, "intervalCount"),
            totalCycles: wholeNumber(form, "totalCycles"),
          }
        : null,
  };
}

export function refundBody(form: FormData): Record<string, unknown> {
  return { amount: text(form, "amount") };
}

const labels: Record<string, string> = {
  email: "Client email",
  legalName: "Legal name",
  address: "Address",
  clientId: "Client",
  type: "Invoice type",
  description: "Description of service",
  sac: "SAC code",
  currency: "Currency",
  amount: "Amount",
  recurrence: "Repeat",
  "recurrence.intervalUnit": "Repeat every",
  "recurrence.intervalCount": "Interval count",
  "recurrence.totalCycles": "Number of invoices",
  password: "Password (12–128 characters)",
  gstRegistered: "GST registered",
  gstin: "GSTIN",
  lutNumber: "LUT number",
  lutValidFrom: "LUT valid from",
  lutValidTo: "LUT valid to",
  workType: "Work description",
  purposeCode: "Purpose code",
  panLast4: "Last 4 characters of PAN",
  expectedTurnoverInr: "Expected turnover",
  name: "Client name",
  country: "Country code",
  "answers.supplierInIndia": "Supplier in India",
  "answers.clientPresentInIndia": "Client present in India",
  "answers.paidInForeignCurrency": "Foreign currency",
  "answers.sameEstablishment": "Own establishment",
};

type FormResult = { ok: true; data?: never } | { ok: false; message: string; reasons?: string[] };
const fallback = { ok: false, message: "Something went wrong. Try again." } as const;

export async function sendJson(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<FormResult>;
export async function sendJson<T>(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | Extract<FormResult, { ok: false }>>;
export async function sendJson(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  schema?: z.ZodType,
): Promise<FormResult | { ok: true; data: unknown }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok && schema) {
      const parsed = schema.safeParse(await response.json());
      return parsed.success ? { ok: true, data: parsed.data } : fallback;
    }
    return await responseResult(response);
  } catch {
    return fallback;
  }
}

export async function sendPdf(url: string, file: File): Promise<FormResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "X-Niryat-Consent": "own-fira" },
      body: file,
    });
    return await responseResult(response);
  } catch {
    return fallback;
  }
}

async function responseResult(response: Response): Promise<FormResult> {
  if (response.ok) return { ok: true };
  const parsed = z
    .object({
      error: z.string(),
      fields: z.array(z.string()).optional(),
      reasons: z.array(z.string()).optional(),
      code: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
        .optional(),
    })
    .safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) return fallback;
  switch (parsed.data.error) {
    case "ai_unavailable":
      return {
        ok: false,
        message: "AI is not configured, so extraction is unavailable. Fill in the form below.",
      };
    case "ai_budget_exhausted":
      return { ok: false, message: "The monthly AI budget is used up. Fill in the form below." };
    case "extraction_running":
      return { ok: false, message: "An extraction is already running." };
    case "extraction_failed":
      return {
        ok: false,
        message: "Claude could not extract details from this text. Fill in the form below.",
      };
    case "invoice_blocked":
      return {
        ok: false,
        message: "This invoice cannot be issued yet:",
        reasons: parsed.data.reasons ?? [],
      };
    case "action_not_pending":
      return { ok: false, message: "This action was already handled. Refresh the page." };
    case "refund_pending":
      return {
        ok: false,
        message: "A refund for this payment is already waiting for your approval.",
      };
    case "refund_exceeds_payment":
      return {
        ok: false,
        message: "The refund is more than what is left to refund on this payment.",
      };
    case "paypal_failed":
      if (!parsed.data.code) return fallback;
      return {
        ok: false,
        message: `PayPal did not accept the request (${parsed.data.code}). Nothing else was sent. You can approve again to retry.`,
      };
    case "paypal_unavailable":
      return { ok: false, message: "PayPal is not configured on this server." };
    case "file_storage_unavailable":
      return { ok: false, message: "File storage is not configured on this server." };
    case "fira_duplicate":
      return { ok: false, message: "This FIRA was already uploaded." };
    case "fira_unreadable":
      return {
        ok: false,
        message:
          "Niryat could not read FIRA lines from this PDF. Upload the digital FIRA PDF from PayPal, not a scan.",
      };
    case "consent_required":
      return { ok: false, message: "Confirm that this is your own FIRA before uploading." };
    case "file_too_large":
      return { ok: false, message: "The PDF is larger than 2 MB." };
    case "no_suggestion":
      return {
        ok: false,
        message: "This line has no suggested match to confirm or reject. Refresh the page.",
      };
    case "not_found":
      return { ok: false, message: "Not found. Refresh the page." };
    case "invalid_request":
      return {
        ok: false,
        message: `Check these fields: ${(parsed.data.fields ?? []).map((field) => labels[field] ?? field).join(", ")}.`,
      };
    case "email_taken":
      return { ok: false, message: "That email is already registered. Sign in instead." };
    case "invalid_credentials":
      return { ok: false, message: "Email or password is incorrect." };
    case "unauthenticated":
      return { ok: false, message: "Your session has ended. Sign in again." };
    default:
      return fallback;
  }
}
