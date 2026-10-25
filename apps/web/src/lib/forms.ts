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
    answers: {
      supplierInIndia: yesNo(form, "supplierInIndia"),
      clientPresentInIndia: yesNo(form, "clientPresentInIndia"),
      paidInForeignCurrency: yesNo(form, "paidInForeignCurrency"),
      sameEstablishment: yesNo(form, "sameEstablishment"),
    },
  };
}

const labels: Record<string, string> = {
  email: "Email",
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

export async function sendJson(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const fallback = { ok: false, message: "Something went wrong. Try again." } as const;
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    const parsed = z
      .object({ error: z.string(), fields: z.array(z.string()).optional() })
      .safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) return fallback;
    switch (parsed.data.error) {
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
  } catch {
    return fallback;
  }
}
