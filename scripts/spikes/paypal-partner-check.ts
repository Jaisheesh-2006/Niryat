// Spike, not product code: can Niryat's app act on another India seller's account through
// Partner Referrals (third-party permissions + PayPal-Auth-Assertion)? Run from the repository root:
//   1. node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env scripts/spikes/paypal-partner-check.ts
//      prints an onboarding link. Open it in a private window and sign in as an India business sandbox
//      account that does NOT own the app, then grant the permissions.
//   2. Copy the full address PayPal redirects you to (or the seller's payer ID), then run:
//      node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env scripts/spikes/paypal-partner-check.ts "<url or payer id>"
// Step 2 creates one draft invoice in the seller's account and deletes it; nothing is sent.
// The secret and tokens are never printed; emails are masked.
import { z } from "zod";

const API = "https://api-m.sandbox.paypal.com";
const RETURN_URL = "https://example.com/niryat-partner";
const FEATURES = [
  "INVOICE_READ_WRITE",
  "ADVANCED_TRANSACTIONS_SEARCH",
  "READ_SELLER_DISPUTE",
  "UPDATE_SELLER_DISPUTE",
  "REFUND",
  "PAYMENT",
  "ACCESS_MERCHANT_INFORMATION",
];

const env = z
  .object({
    PAYPAL_CLIENT_ID: z.string().trim().min(1),
    PAYPAL_CLIENT_SECRET: z.string().trim().min(1),
  })
  .safeParse(process.env);
if (!env.success) {
  console.error(
    `Missing environment keys: ${env.error.issues.map((i) => i.path.join(".")).join(", ")}`,
  );
  process.exit(1);
}
const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret } = env.data;

const ErrorBody = z.looseObject({
  name: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  details: z.array(z.looseObject({ issue: z.string().optional() })).optional(),
});
const describe = (reply: Response, body: unknown) => {
  const e = ErrorBody.safeParse(body);
  const parts = e.success
    ? [
        e.data.name ?? e.data.error,
        e.data.details?.[0]?.issue,
        e.data.message ?? e.data.error_description,
      ]
    : [];
  return [`HTTP ${reply.status}`, ...parts.filter(Boolean)]
    .join(" | ")
    .concat(` | paypal-debug-id=${reply.headers.get("paypal-debug-id") ?? "?"}`);
};
const json = async (response: Response): Promise<unknown> => response.json().catch(() => undefined);
const mask = (email: string | undefined) => (email ? email.replace(/^(.).*@/, "$1***@") : "absent");

const tokenReply = await fetch(`${API}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}` },
  body: new URLSearchParams({ grant_type: "client_credentials" }),
});
const tokenBody = await json(tokenReply);
const token = z
  .object({ access_token: z.string().min(1), scope: z.string().default("") })
  .safeParse(tokenBody);
if (!tokenReply.ok || !token.success) {
  console.log(`FAILS  app token: ${describe(tokenReply, tokenBody)}`);
  process.exit(0);
}
const bearer = { Authorization: `Bearer ${token.data.access_token}` };

const arg = process.argv[2];
if (!arg) {
  console.log(
    `app token: partner-referrals scope ${token.data.scope.includes("partner-referrals") ? "present" : "absent"}`,
  );
  const reply = await fetch(`${API}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({
      tracking_id: `niryat-spike-${crypto.randomUUID().slice(0, 8)}`,
      operations: [
        {
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: { features: FEATURES },
            },
          },
        },
      ],
      products: ["EXPRESS_CHECKOUT"],
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      partner_config_override: { return_url: RETURN_URL },
    }),
  });
  const body = await json(reply);
  const link = z
    .object({ links: z.array(z.object({ rel: z.string(), href: z.url() })) })
    .safeParse(body);
  const actionUrl = link.success
    ? link.data.links.find((l) => l.rel === "action_url")?.href
    : undefined;
  if (!reply.ok || !actionUrl) {
    console.log(`FAILS  create partner referral: ${describe(reply, body)}`);
    process.exit(0);
  }
  console.log(
    `create partner referral: HTTP ${reply.status}\nOpen in a private window, sign in as the seller (not the app owner) and grant the permissions:\n${actionUrl}`,
  );
} else {
  const fromUrl = URL.canParse(arg) ? new URL(arg).searchParams : undefined;
  if (fromUrl) {
    console.log(
      `return URL: permissionsGranted=${fromUrl.get("permissionsGranted") ?? "?"}; consentStatus=${fromUrl.get("consentStatus") ?? "?"}; isEmailConfirmed=${fromUrl.get("isEmailConfirmed") ?? "?"}`,
    );
  }
  const payerId = fromUrl ? fromUrl.get("merchantIdInPayPal") : arg;
  if (!payerId || !/^[A-Z0-9]{8,20}$/.test(payerId)) {
    console.log(
      "FAILS  no seller payer ID: pass the full return URL (with merchantIdInPayPal) or the seller's Account ID from Sandbox accounts",
    );
    process.exit(0);
  }
  // Unsigned JWT as PayPal documents: base64url({"alg":"none"}).base64url({iss, payer_id}).
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const asSeller = {
    ...bearer,
    "PayPal-Auth-Assertion": `${part({ alg: "none" })}.${part({ iss: clientId, payer_id: payerId })}.`,
  };

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const transactions = await fetch(
    `${API}/v1/reporting/transactions?${new URLSearchParams({ start_date: start.toISOString(), end_date: end.toISOString(), page_size: "1" })}`,
    { headers: asSeller },
  );
  console.log(
    `transaction search as seller: ${transactions.ok ? `HTTP ${transactions.status}` : describe(transactions, await json(transactions))}`,
  );

  const disputes = await fetch(`${API}/v1/customer/disputes?page_size=1`, { headers: asSeller });
  console.log(
    `disputes list as seller: ${disputes.ok ? `HTTP ${disputes.status}` : describe(disputes, await json(disputes))}`,
  );

  const draftReply = await fetch(`${API}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      ...asSeller,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      detail: { currency_code: "USD", note: "Niryat partner spike draft; deleted immediately" },
      items: [
        {
          name: "Spike check",
          quantity: "1",
          unit_amount: { currency_code: "USD", value: "1.00" },
        },
      ],
    }),
  });
  const draftBody = await json(draftReply);
  const draft = z
    .looseObject({
      id: z.string().min(1),
      invoicer: z.looseObject({ email_address: z.string().optional() }).optional(),
    })
    .safeParse(draftBody);
  if (!draftReply.ok || !draft.success) {
    console.log(`FAILS  draft invoice as seller: ${describe(draftReply, draftBody)}`);
    process.exit(0);
  }
  const id = draft.data.id;
  console.log(
    `draft invoice as seller: HTTP ${draftReply.status}; invoicer email=${mask(draft.data.invoicer?.email_address)}`,
  );
  // Proof the draft lives in the seller's account: the app owner can't see it without the assertion.
  const ownerView = await fetch(`${API}/v2/invoicing/invoices/${id}`, { headers: bearer });
  console.log(
    `same draft read as app owner: HTTP ${ownerView.status} (404 means it is in the seller's account)`,
  );
  const removed = await fetch(`${API}/v2/invoicing/invoices/${id}`, {
    method: "DELETE",
    headers: asSeller,
  });
  console.log(
    `delete draft as seller: ${removed.ok ? `HTTP ${removed.status}` : describe(removed, await json(removed))}`,
  );
}
