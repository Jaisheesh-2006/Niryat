import { afterEach, expect, it, vi } from "vitest";
import { createPayPalLogin } from "./identity";
import { PayPalApiError } from "./index";

const options = {
  clientId: "client-id",
  clientSecret: "private-secret",
  returnUrl: "http://localhost:3000/api/auth/paypal/callback",
};
const identity = {
  payer_id: "PAYER-SYNTHETIC",
  emails: [{ value: "first@example.com" }, { value: "PRIMARY@example.com", primary: true }],
};

afterEach(() => vi.restoreAllMocks());

it("authorizes only on sandbox with the exact login parameters", () => {
  const url = new URL(createPayPalLogin(options).authorizeUrl("random-state"));
  expect(url.origin + url.pathname).toBe("https://www.sandbox.paypal.com/connect");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    flowEntry: "static",
    client_id: options.clientId,
    response_type: "code",
    redirect_uri: options.returnUrl,
    state: "random-state",
    scope: "openid email https://uri.paypal.com/services/paypalattributes",
  });
  expect(url.href).not.toContain(options.clientSecret);
});

it("exchanges a code once, uses userinfo, and selects the primary normalized email", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ access_token: "temporary-token", refresh_token: "unused" }),
    )
    .mockResolvedValueOnce(Response.json(identity));
  const login = createPayPalLogin({ ...options, fetch: fetcher });
  expect(await login.identify("the-code")).toEqual({
    ok: true,
    paypalId: identity.payer_id,
    email: "primary@example.com",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
  expect(init?.method).toBe("POST");
  expect(init?.headers).toEqual({
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from("client-id:private-secret").toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  });
  expect(init?.body?.toString()).toBe("grant_type=authorization_code&code=the-code");
  expect(fetcher.mock.calls[1]).toEqual([
    "https://api-m.sandbox.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1",
    { headers: { Accept: "application/json", Authorization: "Bearer temporary-token" } },
  ]);
});

it.each([
  { emails: [{ value: "first@example.com" }], expected: "first@example.com" },
  { emails: [], expected: undefined },
  { emails: undefined, expected: undefined },
])("uses the first email or permits a missing email: $expected", async ({ emails, expected }) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ access_token: "token" }))
    .mockResolvedValueOnce(Response.json({ payer_id: identity.payer_id, emails }));
  expect(await createPayPalLogin({ ...options, fetch: fetcher }).identify("code")).toEqual({
    ok: true,
    paypalId: identity.payer_id,
    email: expected,
  });
});

it.each(["exchange_failed", "userinfo_failed"] as const)(
  "returns %s for a PayPal 400 without logging secrets",
  async (reason) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>();
    if (reason === "userinfo_failed")
      fetcher.mockResolvedValueOnce(Response.json({ access_token: "secret-token" }));
    fetcher.mockResolvedValueOnce(
      Response.json(
        { error: "secret-body" },
        {
          status: 400,
          headers: { "paypal-debug-id": "f53869466f982" },
        },
      ),
    );
    expect(await createPayPalLogin({ ...options, fetch: fetcher }).identify("secret-code")).toEqual(
      { ok: false, reason },
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith("PayPal login rejected", {
      status: 400,
      debugId: "f53869466f982",
    });
  },
);

it.each([
  { token: {}, info: identity, reason: "exchange_failed" },
  {
    token: { access_token: "token" },
    info: { user_id: "not-a-payer-id" },
    reason: "userinfo_failed",
  },
  {
    token: { access_token: "token" },
    info: { ...identity, emails: [{ value: "invalid" }] },
    reason: "userinfo_failed",
  },
])("fails closed on malformed responses: $reason", async ({ token, info, reason }) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(token))
    .mockResolvedValueOnce(Response.json(info));
  expect(await createPayPalLogin({ ...options, fetch: fetcher }).identify("code")).toEqual({
    ok: false,
    reason,
  });
});

it("returns a typed failure for invalid JSON", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON"));
  expect(await createPayPalLogin({ ...options, fetch: fetcher }).identify("code")).toEqual({
    ok: false,
    reason: "exchange_failed",
  });
});

it.each(["token", "userinfo"])(
  "propagates %s network failures as sanitized PayPalApiError",
  async (stage) => {
    const fetcher = vi.fn<typeof fetch>();
    if (stage === "userinfo")
      fetcher.mockResolvedValueOnce(Response.json({ access_token: "token" }));
    fetcher.mockRejectedValueOnce(new Error("secret-network-details"));
    await expect(
      createPayPalLogin({ ...options, fetch: fetcher }).identify("code"),
    ).rejects.toEqual(new PayPalApiError(0, "NETWORK_ERROR"));
  },
);

it.each(["token", "userinfo"])("throws for %s server errors", async (stage) => {
  const fetcher = vi.fn<typeof fetch>();
  if (stage === "userinfo") fetcher.mockResolvedValueOnce(Response.json({ access_token: "token" }));
  fetcher.mockResolvedValueOnce(new Response("private error", { status: 503 }));
  await expect(createPayPalLogin({ ...options, fetch: fetcher }).identify("code")).rejects.toEqual(
    new PayPalApiError(503, "HTTP_503"),
  );
});
