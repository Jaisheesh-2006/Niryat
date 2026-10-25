// Spike, not product code: Log in with PayPal on sandbox (build flow Phase 0).
// Run from the repository root:
//   1. node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env scripts/spikes/paypal-login-check.ts
//      prints the sign-in URL. Open it and sign in as the India business sandbox account.
//   2. Copy the `code` value from the address bar PayPal redirects you to, then run:
//      node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env scripts/spikes/paypal-login-check.ts <code>
// The secret and tokens are never printed; the email is masked.
import { z } from "zod";

// Must equal the Return URL in the app's Log in with PayPal > Advanced Settings.
const RETURN_URL = "https://example.com/niryat-login";
const API = "https://api-m.sandbox.paypal.com";

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
  error: z.string().optional(),
  error_description: z.string().optional(),
  name: z.string().optional(),
  message: z.string().optional(),
});
const describe = (status: number, body: unknown) => {
  const e = ErrorBody.safeParse(body);
  const parts = e.success
    ? [e.data.error ?? e.data.name, e.data.error_description ?? e.data.message]
    : [];
  return [`HTTP ${status}`, ...parts.filter(Boolean)].join(" | ");
};
const json = async (response: Response): Promise<unknown> => response.json().catch(() => undefined);

const code = process.argv[2];
if (!code) {
  // shortcut: `state` is not checked between the two runs; the product flow must verify it.
  const url = new URL("https://www.sandbox.paypal.com/connect");
  url.search = new URLSearchParams({
    flowEntry: "static",
    client_id: clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: RETURN_URL,
    state: crypto.randomUUID(),
  }).toString();
  console.log(`Open this URL and sign in as the India business sandbox account:\n${url.href}`);
} else {
  const tokenReply = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code }),
  });
  const tokenBody = await json(tokenReply);
  const token = z
    .object({
      access_token: z.string().min(1),
      scope: z.string().optional(),
      id_token: z.string().optional(),
    })
    .safeParse(tokenBody);
  if (!tokenReply.ok || !token.success) {
    console.log(`FAILS  code exchange: ${describe(tokenReply.status, tokenBody)}`);
    process.exit(0);
  }
  // shortcut: id_token is decoded without signature verification; the product must verify it
  // against PayPal's JWKS before trusting `sub`.
  const claims = z
    .looseObject({ sub: z.string().optional(), email: z.string().optional() })
    .safeParse(
      JSON.parse(
        Buffer.from(token.data.id_token?.split(".")[1] ?? "", "base64url").toString() || "{}",
      ),
    );
  console.log(
    `code exchange HTTP ${tokenReply.status}; scope="${token.data.scope ?? "?"}"; id_token=${token.data.id_token ? "present" : "absent"}; ` +
      `sub=${claims.success && claims.data.sub ? "present" : "absent"}; email claim=${claims.success && claims.data.email ? "present" : "absent"}`,
  );
  const userinfo = (schema: string) =>
    fetch(`${API}/v1/identity/oauth2/userinfo?schema=${schema}`, {
      headers: { Authorization: `Bearer ${token.data.access_token}` },
    });
  let infoReply = await userinfo("paypalv1.1");
  if (!infoReply.ok) {
    console.log(
      `userinfo schema=paypalv1.1: ${describe(infoReply.status, await json(infoReply))} | paypal-debug-id=${infoReply.headers.get("paypal-debug-id") ?? "?"}`,
    );
    infoReply = await userinfo("openid");
  }
  const infoBody = await json(infoReply);
  const info = z
    .looseObject({
      user_id: z.string().optional(),
      sub: z.string().optional(),
      email: z.string().optional(),
      payer_id: z.string().optional(),
      verified_account: z.union([z.boolean(), z.string()]).optional(),
      emails: z
        .array(z.looseObject({ value: z.string(), primary: z.boolean().optional() }))
        .optional(),
    })
    .safeParse(infoBody);
  if (!infoReply.ok || !info.success) {
    console.log(
      `PARTIAL  code exchanged, userinfo schema=openid also failed: ${describe(infoReply.status, infoBody)} | paypal-debug-id=${infoReply.headers.get("paypal-debug-id") ?? "?"}`,
    );
    process.exit(0);
  }
  const email =
    info.data.emails?.find((e) => e.primary)?.value ??
    info.data.emails?.[0]?.value ??
    info.data.email;
  const masked = email ? email.replace(/^(.).*@/, "$1***@") : "absent";
  console.log(
    `WORKS  Log in with PayPal: token scope="${token.data.scope ?? "?"}"; payer_id=${info.data.payer_id ? "present" : "absent"}; ` +
      `user_id/sub=${info.data.user_id || info.data.sub ? "present" : "absent"}; verified_account=${info.data.verified_account ?? "?"}; email=${masked}`,
  );
}
