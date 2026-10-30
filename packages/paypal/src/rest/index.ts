import { setTimeout } from "node:timers/promises";
import { z } from "zod";

const BASE_URL = "https://api-m.sandbox.paypal.com";
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const errorCodeSchema = z
  .string()
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const errorSchema = z.object({
  name: errorCodeSchema.optional(),
  error: errorCodeSchema.optional(),
  debug_id: z
    .string()
    .max(100)
    .regex(/^[A-Za-z0-9-]+$/)
    .optional(),
});

export type PayPalRestPath =
  | `/v2/invoicing/${string}`
  | `/v1/customer/disputes${string}`
  | "/v1/notifications/verify-webhook-signature";

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly debugId?: string,
  ) {
    super(`PayPal ${status} ${code}`);
    this.name = "PayPalApiError";
  }
}

export interface PayPalRestClient {
  get<T>(path: PayPalRestPath, parse: (input: unknown) => T): Promise<T>;
  post<T>(
    path: PayPalRestPath,
    body: unknown,
    requestId: string,
    parse: (input: unknown) => T,
    options?: { retry: false },
  ): Promise<T>;
}

export function createPayPalRestClient(options: {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
}): PayPalRestClient {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  async function exchange(
    path: string,
    init: RequestInit,
    retry = true,
  ): Promise<{
    status: number;
    body: unknown;
  }> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      let text: string;
      try {
        response = await fetcher(`${BASE_URL}${path}`, init);
        text = await response.text();
      } catch {
        if (retry && attempt === 0) {
          await setTimeout(500);
          continue;
        }
        throw new PayPalApiError(0, "NETWORK_ERROR");
      }
      if (retry && response.status >= 500 && attempt === 0) {
        await setTimeout(500);
        continue;
      }
      let body: unknown;
      try {
        body = text === "" ? undefined : JSON.parse(text);
      } catch {
        if (response.ok) throw new PayPalApiError(response.status, "INVALID_RESPONSE");
      }
      if (!response.ok) {
        const error = errorSchema.safeParse(body);
        throw new PayPalApiError(
          response.status,
          error.success
            ? (error.data.name ?? error.data.error ?? `HTTP_${response.status}`)
            : `HTTP_${response.status}`,
          error.success ? error.data.debug_id : undefined,
        );
      }
      return { status: response.status, body };
    }
  }

  function parseResponse<T>(status: number, body: unknown, parse: (input: unknown) => T): T {
    try {
      return parse(body);
    } catch {
      throw new PayPalApiError(status, "INVALID_RESPONSE");
    }
  }

  async function getToken(): Promise<string> {
    if (pendingToken) return pendingToken;
    if (token && token.expiresAt - now() >= 300_000) return token.value;
    pendingToken = (async () => {
      const { status, body } = await exchange("/v1/oauth2/token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const result = parseResponse(status, body, tokenSchema.parse);
      token = { value: result.access_token, expiresAt: now() + result.expires_in * 1000 };
      return token.value;
    })();
    try {
      return await pendingToken;
    } finally {
      pendingToken = undefined;
    }
  }

  async function request<T>(
    path: PayPalRestPath,
    init: RequestInit,
    parse: (input: unknown) => T,
    retry = true,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const accessToken = await getToken();
      let result: { status: number; body: unknown };
      try {
        result = await exchange(
          path,
          {
            ...init,
            headers: {
              ...init.headers,
              Accept: "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          },
          retry,
        );
      } catch (error) {
        if (error instanceof PayPalApiError && error.status === 401) {
          if (token?.value === accessToken) token = undefined;
          if (retry && attempt === 0) continue;
        }
        throw error;
      }
      return parseResponse(result.status, result.body, parse);
    }
  }

  return {
    get: (path, parse) => request(path, { method: "GET" }, parse),
    post: (path, body, requestId, parse, callOptions) => {
      const input = z.json().optional().safeParse(body);
      if (!input.success) return Promise.reject(new PayPalApiError(0, "INVALID_REQUEST"));
      const serialized = JSON.stringify(input.data);
      return request(
        path,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "PayPal-Request-Id": requestId },
          ...(serialized === undefined ? {} : { body: serialized }),
          ...(callOptions?.retry === false ? { redirect: "error" } : {}),
        },
        parse,
        callOptions?.retry !== false,
      );
    },
  };
}
