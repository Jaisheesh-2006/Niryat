// Spike, not product code: PayPal India sandbox capability check.
// Results are written up in docs/paypal-sandbox-findings.md.
//
// Sandbox only. Run from the repository root:
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env scripts/spikes/paypal-india-check.ts
//
// Environment (supplied by you; never printed):
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET  sandbox REST app of the India business seller
//   PAYPAL_SANDBOX_BUYER_EMAIL              email of the US personal sandbox buyer
//   PAYPAL_ENVIRONMENT                      optional; must be SANDBOX
//
// Checks 2-5 and 8 create invoices in the seller sandbox account; checks 2-5 email the sandbox
// buyer, and check 4 activates a two-cycle monthly recurring series. Nothing here touches production or moves money.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PayPalRestClient } from "../../packages/paypal/src/rest/index.ts";

const BASE_URL = "https://api-m.sandbox.paypal.com";
// Used only for requests that are never sent: endpoint probes and drafts that are deleted.
const PLACEHOLDER_RECIPIENT = "spike-recipient@example.com";

// Invoicing v2 and Disputes v1 paths follow the packages/paypal/rest boundary type.
type RestPath =
  | Parameters<PayPalRestClient["request"]>[0]
  | "/v1/oauth2/token"
  | "/v1/reporting/transactions";

type Verdict = "works" | "partial" | "unsupported" | "fails" | "blocked";
interface Outcome {
  verdict: Verdict;
  summary: string;
}
interface Reply {
  status: number;
  body: unknown;
}
interface Context {
  token: string;
  scopes: string[];
  buyerEmail: string | undefined;
  sentInvoiceId: string | undefined;
}

const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const Environment = z.object({
  PAYPAL_CLIENT_ID: z.string().trim().min(1),
  PAYPAL_CLIENT_SECRET: z.string().trim().min(1),
  PAYPAL_ENVIRONMENT: optionalText(z.literal("SANDBOX")),
  PAYPAL_SANDBOX_BUYER_EMAIL: optionalText(z.email()),
});

const ErrorBody = z.looseObject({
  name: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  debug_id: z.string().optional(),
  details: z
    .array(
      z.looseObject({
        issue: z.string().optional(),
        field: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

const Money = z.looseObject({ currency_code: z.string(), value: z.string() });

const TokenBody = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

const LinkBody = z.looseObject({ id: z.string().optional(), href: z.string().optional() });

const InvoiceView = z.looseObject({
  status: z.string().optional(),
  detail: z
    .looseObject({
      invoice_number: z.string().optional(),
      currency_code: z.string().optional(),
      attachments: z.array(z.unknown()).optional(),
    })
    .optional(),
  amount: z.looseObject({ value: z.string().optional() }).optional(),
  configuration: z
    .looseObject({
      partial_payment: z
        .looseObject({
          allow_partial_payment: z.boolean().optional(),
          minimum_amount_due: Money.optional(),
        })
        .optional(),
    })
    .optional(),
});

const TransactionSearchBody = z.looseObject({
  total_items: z.number().optional(),
  last_refreshed_datetime: z.string().optional(),
  transaction_details: z
    .array(
      z.looseObject({
        transaction_info: z
          .looseObject({
            transaction_id: z.string().optional(),
            transaction_event_code: z.string().optional(),
            transaction_amount: Money.optional(),
            fee_amount: Money.optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const StatusBody = z.looseObject({ status: z.string().optional() });

const DisputeListBody = z.looseObject({
  total_items: z.number().optional(),
  items: z.array(z.looseObject({ dispute_state: z.string().optional() })).optional(),
});

function loadEnvironment() {
  const parsed = Environment.safeParse(process.env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    console.error(`Invalid or missing environment keys: ${keys.join(", ")}`);
    process.exit(1);
  }
  return parsed.data;
}

async function call(
  method: "GET" | "POST" | "DELETE",
  path: RestPath,
  options: {
    token?: string;
    query?: Record<string, string>;
    body?: unknown;
    form?: URLSearchParams;
    basic?: string;
  } = {},
): Promise<Reply> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.basic) headers.Authorization = `Basic ${options.basic}`;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: string | URLSearchParams | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (method === "POST") headers["PayPal-Request-Id"] = randomUUID();
  const response = await fetch(
    url,
    body === undefined ? { method, headers } : { method, headers, body },
  );
  const text = await response.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: `non-JSON body (${text.length} bytes)` };
    }
  }
  return { status: response.status, body: parsed };
}

const isOk = (reply: Reply) => reply.status >= 200 && reply.status < 300;

function describe(reply: Reply): string {
  const parsed = ErrorBody.safeParse(reply.body ?? {});
  const parts = [`HTTP ${reply.status}`];
  if (!parsed.success) return `${parts[0]} (unrecognised body)`;
  const body = parsed.data;
  const label = body.name ?? body.error;
  const message = body.message ?? body.error_description;
  if (label) parts.push(label);
  if (message) parts.push(message);
  const issues = (body.details ?? [])
    .slice(0, 3)
    .map((detail) => [detail.issue, detail.field, detail.description].filter(Boolean).join(" "));
  if (issues.length > 0) parts.push(`details: ${issues.join("; ")}`);
  if (body.debug_id) parts.push(`debug_id=${body.debug_id}`);
  return parts.join(" | ");
}

function invoiceIdFrom(reply: Reply): string | undefined {
  const parsed = LinkBody.safeParse(reply.body);
  if (!parsed.success) return undefined;
  return parsed.data.id ?? parsed.data.href?.split("/").pop();
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function invoiceBody(buyerEmail: string, options: { partial?: boolean; attachments?: boolean }) {
  const number = `SPIKE-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  return {
    detail: {
      invoice_number: number,
      invoice_date: new Date().toISOString().slice(0, 10),
      currency_code: "USD",
      note: "Niryat sandbox capability check. Ignore.",
      terms_and_conditions:
        "Supply meant for export of services under LUT, without payment of IGST.",
      payment_term: { term_type: "DUE_ON_RECEIPT" },
      ...(options.attachments
        ? {
            attachments: [
              {
                // Docs call these "PayPal IDs for the files"; no upload endpoint is documented,
                // so this tests whether an ID PayPal never issued is accepted.
                id: "niryat-spike-file-1",
                reference_url: "https://example.com/niryat-spike-attachment.pdf",
                content_type: "application/pdf",
              },
            ],
          }
        : {}),
    },
    primary_recipients: [{ billing_info: { email_address: buyerEmail } }],
    items: [
      {
        name: "Software consulting (spike)",
        quantity: "1",
        unit_amount: { currency_code: "USD", value: "100.00" },
      },
    ],
    ...(options.partial
      ? {
          configuration: {
            partial_payment: {
              allow_partial_payment: true,
              minimum_amount_due: { currency_code: "USD", value: "20.00" },
            },
          },
        }
      : {}),
  };
}

async function createInvoice(
  ctx: Context,
  buyerEmail: string,
  options: { partial?: boolean; attachments?: boolean },
) {
  const reply = await call("POST", "/v2/invoicing/invoices", {
    token: ctx.token,
    body: invoiceBody(buyerEmail, options),
  });
  return { reply, id: isOk(reply) ? invoiceIdFrom(reply) : undefined };
}

function sendInvoice(ctx: Context, id: string) {
  return call("POST", `/v2/invoicing/invoices/${id}/send`, {
    token: ctx.token,
    body: {
      subject: "Niryat sandbox spike",
      note: "Sandbox capability check. Ignore.",
      send_to_recipient: true,
      send_to_invoicer: false,
    },
  });
}

async function readInvoice(ctx: Context, id: string) {
  const reply = await call("GET", `/v2/invoicing/invoices/${id}`, { token: ctx.token });
  const parsed = InvoiceView.safeParse(reply.body);
  return { reply, view: isOk(reply) && parsed.success ? parsed.data : undefined };
}

const outcome = (verdict: Verdict, summary: string): Outcome => ({ verdict, summary });
const needsBuyer = (ctx: Context) =>
  outcome(
    "blocked",
    "PAYPAL_SANDBOX_BUYER_EMAIL is not set; cannot address an invoice." +
      (hasScope(ctx, "invoicing") ? "" : " The app token also lacks the invoicing scope."),
  );

const hasScope = (ctx: Context, needle: string) =>
  ctx.scopes.some((scope) => scope.includes(needle));

// A 403 while the token lacks the feature's scope means the sandbox REST app is not set up for it
// (Developer Dashboard > app > Features). That says nothing about India account support.
function appLacksFeature(
  ctx: Context,
  reply: Reply,
  scope: string,
  feature: string,
): Outcome | undefined {
  if (reply.status !== 403 || hasScope(ctx, scope)) return undefined;
  return outcome(
    "blocked",
    `${describe(reply)}. The app token has no "${scope}" scope: enable ${feature} on the sandbox REST app, then rerun.`,
  );
}

async function checkOAuth(ctx: Context, id: string, secret: string): Promise<Outcome> {
  const reply = await call("POST", "/v1/oauth2/token", {
    basic: Buffer.from(`${id}:${secret}`).toString("base64"),
    form: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const parsed = TokenBody.safeParse(reply.body);
  if (!isOk(reply) || !parsed.success) return outcome("fails", describe(reply));
  ctx.token = parsed.data.access_token;
  const scopes = (parsed.data.scope ?? "").split(/\s+/).filter(Boolean);
  ctx.scopes = scopes;
  const has = (needle: string) => (hasScope(ctx, needle) ? "yes" : "no");
  // Scope names are public URIs, not secrets; shortened to show which app features are enabled.
  const names = scopes.map((scope) => scope.replace("https://uri.paypal.com/services/", ""));
  return outcome(
    "works",
    `HTTP ${reply.status}; expires_in=${parsed.data.expires_in ?? "?"}s; scopes=${scopes.length} ` +
      `(invoicing=${has("invoicing")}, reporting/search=${has("reporting/search")}, disputes=${has("disputes")})\n` +
      `    scope names: ${names.join(", ")}`,
  );
}

async function checkInvoiceSend(ctx: Context): Promise<Outcome> {
  if (!ctx.buyerEmail) return needsBuyer(ctx);
  const created = await createInvoice(ctx, ctx.buyerEmail, {});
  if (!created.id) {
    return (
      appLacksFeature(ctx, created.reply, "invoicing", "Invoicing") ??
      outcome("fails", `create: ${describe(created.reply)}`)
    );
  }
  const sent = await sendInvoice(ctx, created.id);
  if (!isOk(sent)) {
    return outcome(
      "partial",
      `draft ${created.id} created (HTTP ${created.reply.status}); send: ${describe(sent)}`,
    );
  }
  ctx.sentInvoiceId = created.id;
  const { view } = await readInvoice(ctx, created.id);
  return outcome(
    "works",
    `create HTTP ${created.reply.status}, send HTTP ${sent.status}; invoice ${created.id}; ` +
      `status=${view?.status ?? "?"}; total=${view?.amount?.value ?? "?"} ${view?.detail?.currency_code ?? "?"}; ` +
      `to ${maskEmail(ctx.buyerEmail)}; note and terms_and_conditions accepted`,
  );
}

async function checkPartialPayments(ctx: Context): Promise<Outcome> {
  if (!ctx.buyerEmail) return needsBuyer(ctx);
  const created = await createInvoice(ctx, ctx.buyerEmail, { partial: true });
  if (!created.id) {
    return (
      appLacksFeature(ctx, created.reply, "invoicing", "Invoicing") ??
      outcome("fails", `create with partial_payment: ${describe(created.reply)}`)
    );
  }
  const sent = await sendInvoice(ctx, created.id);
  const { view } = await readInvoice(ctx, created.id);
  const partial = view?.configuration?.partial_payment;
  const echoed = partial?.allow_partial_payment === true;
  const detail =
    `invoice ${created.id}; status=${view?.status ?? "?"}; allow_partial_payment=${partial?.allow_partial_payment ?? "absent"}; ` +
    `minimum_amount_due=${partial?.minimum_amount_due?.value ?? "absent"}`;
  if (!isOk(sent))
    return outcome("partial", `created, but send failed: ${describe(sent)}; ${detail}`);
  if (!echoed) return outcome("partial", `accepted but flag not echoed on read-back; ${detail}`);
  return outcome(
    "works",
    `create HTTP ${created.reply.status}, send HTTP ${sent.status}; ${detail}`,
  );
}

async function checkRecurring(ctx: Context): Promise<Outcome> {
  if (!ctx.buyerEmail) return needsBuyer(ctx);
  // Shape from developer.paypal.com/api/invoicing/v2/recurring-invoices-create. A series starts as
  // DRAFT and only generates invoices once activated; total_cycles bounds it to two.
  const created = await call("POST", "/v2/invoicing/recurring-invoices", {
    token: ctx.token,
    body: {
      plan_detail: {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        total_cycles: 2,
        start_series_date: new Date().toISOString().slice(0, 10),
      },
      recurring_info: {
        detail: {
          currency_code: "USD",
          note: "Niryat sandbox capability check. Ignore.",
          payment_term: { term_type: "DUE_ON_RECEIPT" },
        },
        primary_recipients: [{ billing_info: { email_address: ctx.buyerEmail } }],
        items: [
          {
            name: "Monthly retainer (spike)",
            quantity: "1",
            unit_amount: { currency_code: "USD", value: "100.00" },
          },
        ],
      },
    },
  });
  const id = isOk(created) ? invoiceIdFrom(created) : undefined;
  if (!id) {
    return (
      appLacksFeature(ctx, created, "invoicing", "Invoicing") ??
      outcome("fails", `create series: ${describe(created)}`)
    );
  }
  const activated = await call("POST", `/v2/invoicing/recurring-invoices/${id}/activate`, {
    token: ctx.token,
  });
  const read = await call("GET", `/v2/invoicing/recurring-invoices/${id}`, { token: ctx.token });
  const status = StatusBody.safeParse(read.body);
  const detail = `series ${id}; create HTTP ${created.status}; status=${status.success ? (status.data.status ?? "?") : "?"}`;
  if (!isOk(activated)) return outcome("partial", `${detail}; activate: ${describe(activated)}`);
  return outcome("works", `${detail}; activate HTTP ${activated.status}`);
}

async function checkReminder(ctx: Context): Promise<Outcome> {
  if (!ctx.sentInvoiceId)
    return outcome("blocked", "needs the sent invoice from check 2, which did not succeed.");
  const reply = await call("POST", `/v2/invoicing/invoices/${ctx.sentInvoiceId}/remind`, {
    token: ctx.token,
    body: {
      subject: "Niryat sandbox reminder",
      note: "Sandbox capability check. Ignore.",
      send_to_invoicer: false,
    },
  });
  if (!isOk(reply)) return outcome("fails", `remind ${ctx.sentInvoiceId}: ${describe(reply)}`);
  return outcome("works", `remind ${ctx.sentInvoiceId}: HTTP ${reply.status}`);
}

async function checkTransactionSearch(ctx: Context): Promise<Outcome> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const reply = await call("GET", "/v1/reporting/transactions", {
    token: ctx.token,
    query: {
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      fields: "transaction_info",
      page_size: "100",
    },
  });
  if (!isOk(reply)) {
    return (
      appLacksFeature(ctx, reply, "reporting/search", "Transaction Search") ??
      outcome("fails", describe(reply))
    );
  }
  const parsed = TransactionSearchBody.safeParse(reply.body);
  if (!parsed.success) return outcome("fails", "unexpected response shape");
  const rows = (parsed.data.transaction_details ?? []).flatMap((row) =>
    row.transaction_info ? [row.transaction_info] : [],
  );
  // Only payments received (event codes T00xx) carry a PayPal fee. Other rows, such as the T1900
  // starting-balance correction on a new sandbox account, say nothing about fees.
  const payments = rows.filter((info) => info.transaction_event_code?.startsWith("T00"));
  const others = rows.length - payments.length;
  const withFee = payments.filter((info) => info.fee_amount && info.transaction_amount);
  if (payments.length === 0) {
    return outcome(
      "blocked",
      `search succeeded (HTTP 200) but returned no payment rows (T00xx) in the last 30 days` +
        (others > 0
          ? ` (${others} other rows: ${rows.map((r) => r.transaction_event_code).join(", ")})`
          : "") +
        `, so fee/net cannot be observed. Index covers up to ${parsed.data.last_refreshed_datetime ?? "?"}; a payment ` +
        "made after that is not searchable yet. Have the buyer pay a sandbox invoice, wait for indexing, rerun.",
    );
  }
  const sample = withFee[0];
  if (!sample?.transaction_amount || !sample.fee_amount) {
    return outcome(
      "partial",
      `${payments.length} payment rows returned but none carries fee_amount in transaction_info.`,
    );
  }
  const gross = Number(sample.transaction_amount.value);
  const fee = Number(sample.fee_amount.value);
  return outcome(
    "works",
    `${payments.length} payment rows, ${withFee.length} with fee_amount; sample ${sample.transaction_event_code ?? "?"}: ` +
      `gross ${gross.toFixed(2)} ${sample.transaction_amount.currency_code}, fee ${fee.toFixed(2)}, net ${(gross + fee).toFixed(2)} ` +
      "(net derived as gross + fee; no net field is returned)",
  );
}

async function checkDisputes(ctx: Context): Promise<Outcome> {
  const reply = await call("GET", "/v1/customer/disputes", {
    token: ctx.token,
    query: { page_size: "5" },
  });
  if (!isOk(reply)) return outcome("fails", describe(reply));
  const parsed = DisputeListBody.safeParse(reply.body ?? {});
  if (!parsed.success) return outcome("fails", "unexpected response shape");
  const count = parsed.data.items?.length ?? 0;
  return outcome(
    "works",
    `HTTP ${reply.status}; items on page=${count}; total_items=${parsed.data.total_items ?? "absent"}. ` +
      (count === 0 ? "List is readable but empty, so opening a dispute is still unverified." : ""),
  );
}

async function checkAttachments(ctx: Context): Promise<Outcome> {
  // Only a draft is created (then deleted), so a placeholder recipient is safe without a buyer.
  const created = await createInvoice(ctx, ctx.buyerEmail ?? PLACEHOLDER_RECIPIENT, {
    attachments: true,
  });
  if (!created.id) {
    const reason = describe(created.reply);
    if (reason.includes("attachments")) {
      return outcome(
        "unsupported",
        `draft with detail.attachments[id, reference_url] rejected: ${reason}. ` +
          "Only PayPal-issued file IDs are accepted and no upload endpoint is documented.",
      );
    }
    return (
      appLacksFeature(ctx, created.reply, "invoicing", "Invoicing") ??
      outcome("fails", `draft with detail.attachments: ${reason}`)
    );
  }
  const { view } = await readInvoice(ctx, created.id);
  const stored = view?.detail?.attachments?.length ?? 0;
  // The probe needs a real invoice id, otherwise a 404 only says the invoice is unknown.
  const upload = await call("POST", `/v2/invoicing/invoices/${created.id}/attachments`, {
    token: ctx.token,
    body: {},
  });
  const removed = await call("DELETE", `/v2/invoicing/invoices/${created.id}`, {
    token: ctx.token,
  });
  const notes =
    `draft ${created.id} with detail.attachments[id, reference_url]: HTTP ${created.reply.status}, stored attachments=${stored}; ` +
    `probe POST .../invoices/{id}/attachments: ${describe(upload)}; draft cleanup: HTTP ${removed.status}`;
  if (isOk(upload)) return outcome("works", notes);
  if (stored > 0) return outcome("partial", `${notes}. Only URL references are stored; no upload.`);
  if (upload.status === 404 || upload.status === 405) return outcome("unsupported", notes);
  return outcome("blocked", `inconclusive; ${notes}`);
}

const LABEL: Record<Verdict, string> = {
  works: "WORKS",
  partial: "PARTIAL",
  unsupported: "UNSUPPORTED",
  fails: "FAILS",
  blocked: "BLOCKED",
};

async function main() {
  const env = loadEnvironment();
  const ctx: Context = {
    token: "",
    scopes: [],
    buyerEmail: env.PAYPAL_SANDBOX_BUYER_EMAIL,
    sentInvoiceId: undefined,
  };
  console.log(`PayPal India sandbox check against ${BASE_URL}`);
  console.log(
    `Buyer: ${ctx.buyerEmail ? maskEmail(ctx.buyerEmail) : "not set (checks 2-5 will be blocked)"}\n`,
  );

  const checks: Array<[string, () => Promise<Outcome>]> = [
    [
      "OAuth client-credentials token",
      () => checkOAuth(ctx, env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET),
    ],
    ["Create + send USD invoice to US buyer", () => checkInvoiceSend(ctx)],
    ["Invoice with partial payments allowed", () => checkPartialPayments(ctx)],
    ["Recurring invoice series (create + activate)", () => checkRecurring(ctx)],
    ["Send invoice reminder", () => checkReminder(ctx)],
    ["Transaction search returns fee + net", () => checkTransactionSearch(ctx)],
    ["Disputes list (Disputes v1)", () => checkDisputes(ctx)],
    ["Invoice attachment upload", () => checkAttachments(ctx)],
  ];

  const results: Array<{ name: string } & Outcome> = [];
  for (const [index, [name, run]] of checks.entries()) {
    let result: Outcome;
    if (index > 0 && !ctx.token) {
      result = outcome("blocked", "no access token (check 1 failed).");
    } else {
      try {
        result = await run();
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown error";
        result = outcome("fails", `unexpected error: ${reason}`);
      }
    }
    results.push({ name, ...result });
    console.log(
      `[${index + 1}/${checks.length}] ${LABEL[result.verdict]}  ${name}\n    ${result.summary}\n`,
    );
  }

  console.log("Summary");
  for (const [index, result] of results.entries()) {
    console.log(`${index + 1}. ${LABEL[result.verdict].padEnd(11)} ${result.name}`);
  }
}

main().catch((error: unknown) => {
  console.error(`Spike aborted: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 2;
});
