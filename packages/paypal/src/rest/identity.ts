import { z } from "zod";
import { PayPalApiError } from "./index";

const tokenSchema = z.object({ access_token: z.string().min(1) });
const userInfoSchema = z.object({
  payer_id: z.string().min(1),
  emails: z
    .array(z.object({ value: z.email().trim().toLowerCase(), primary: z.boolean().optional() }))
    .optional(),
});
const debugIdSchema = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9-]+$/);

export interface PayPalLogin {
  authorizeUrl(state: string): string;
  identify(
    code: string,
  ): Promise<
    | { ok: true; paypalId: string; email: string | undefined }
    | { ok: false; reason: "exchange_failed" | "userinfo_failed" }
  >;
}

export function createPayPalLogin(options: {
  clientId: string;
  clientSecret: string;
  returnUrl: string;
  fetch?: typeof fetch;
}): PayPalLogin {
  const fetcher = options.fetch ?? fetch;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    let body: string;
    try {
      response = await fetcher(`https://api-m.sandbox.paypal.com${path}`, init);
      body = await response.text();
    } catch {
      throw new PayPalApiError(0, "NETWORK_ERROR");
    }
    const debugId = debugIdSchema.safeParse(response.headers.get("paypal-debug-id"));
    if (response.status >= 400 && response.status < 500) {
      console.warn("PayPal login rejected", {
        status: response.status,
        debugId: debugId.success ? debugId.data : undefined,
      });
      return undefined;
    }
    if (!response.ok) {
      throw new PayPalApiError(
        response.status,
        `HTTP_${response.status}`,
        debugId.success ? debugId.data : undefined,
      );
    }
    try {
      return JSON.parse(body);
    } catch {
      return undefined;
    }
  }

  return {
    authorizeUrl(state) {
      const url = new URL("https://www.sandbox.paypal.com/connect");
      url.search = new URLSearchParams({
        flowEntry: "static",
        client_id: options.clientId,
        response_type: "code",
        redirect_uri: options.returnUrl,
        state,
        scope: "openid email https://uri.paypal.com/services/paypalattributes",
      }).toString();
      return url.href;
    },
    async identify(code) {
      const token = tokenSchema.safeParse(
        await request("/v1/oauth2/token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ grant_type: "authorization_code", code }),
        }),
      );
      if (!token.success) return { ok: false, reason: "exchange_failed" };
      const info = userInfoSchema.safeParse(
        await request("/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token.data.access_token}`,
          },
        }),
      );
      if (!info.success) return { ok: false, reason: "userinfo_failed" };
      return {
        ok: true,
        paypalId: info.data.payer_id,
        email:
          info.data.emails?.find((email) => email.primary)?.value ?? info.data.emails?.[0]?.value,
      };
    },
  };
}
