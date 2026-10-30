import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createPayPalRestClient, PayPalApiError } from "../index";

const path = "/v2/invoicing/invoices";
const parse = z.object({ id: z.string() }).parse;
const token = () => Response.json({ access_token: "private-token", expires_in: 3600 });

function setup(now?: () => number) {
  const fetcher = vi.fn<typeof fetch>();
  const rest = createPayPalRestClient({
    clientId: "client-id",
    clientSecret: "private-secret",
    fetch: fetcher,
    ...(now ? { now } : {}),
  });
  return { fetcher, rest };
}

it("shares token requests, caches until fewer than 300 seconds remain, and uses sandbox OAuth", async () => {
  let now = 0;
  let tokenCalls = 0;
  const { fetcher, rest } = setup(() => now);
  fetcher.mockImplementation(async (url) => {
    if (String(url).endsWith("/v1/oauth2/token")) {
      tokenCalls++;
      return token();
    }
    return Response.json({ id: "INV2-TEST" });
  });
  await Promise.all([rest.get(path, parse), rest.get(path, parse)]);
  expect(tokenCalls).toBe(1);
  now = 3_300_000;
  await rest.get(path, parse);
  expect(tokenCalls).toBe(1);
  now++;
  await Promise.all([rest.get(path, parse), rest.get(path, parse)]);
  expect(tokenCalls).toBe(2);
  expect(
    fetcher.mock.calls.every(([url]) =>
      String(url).startsWith("https://api-m.sandbox.paypal.com/"),
    ),
  ).toBe(true);
  for (const [, init] of fetcher.mock.calls) {
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
  }
  expect(fetcher.mock.calls[0]).toEqual([
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from("client-id:private-secret").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  ]);
});

it.each([200, 401])("refreshes on 401 exactly once (retry status %s)", async (status) => {
  const { fetcher, rest } = setup();
  fetcher
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(Response.json({ name: "AUTHENTICATION_FAILURE" }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ access_token: "fresh-token", expires_in: 3600 }))
    .mockResolvedValueOnce(
      Response.json({ id: "INV2-TEST", name: "AUTHENTICATION_FAILURE" }, { status }),
    );
  if (status === 200) {
    await expect(rest.get(path, parse)).resolves.toEqual({ id: "INV2-TEST" });
  } else {
    await expect(rest.get(path, parse)).rejects.toMatchObject({
      status: 401,
      code: "AUTHENTICATION_FAILURE",
    });
  }
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(
    fetcher.mock.calls
      .filter(([, init]) => init?.method === "GET")
      .map(([, init]) => new Headers(init?.headers).get("Authorization")),
  ).toEqual(["Bearer private-token", "Bearer fresh-token"]);
  if (status === 401) {
    fetcher
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(Response.json({ id: "INV2-TEST" }));
    await expect(rest.get(path, parse)).resolves.toEqual({ id: "INV2-TEST" });
    expect(fetcher).toHaveBeenCalledTimes(6);
  }
});

it("retries a POST after 503 with the same body and request ID", async () => {
  const { fetcher, rest } = setup();
  fetcher
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(Response.json({ name: "SERVICE_UNAVAILABLE" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ id: "INV2-TEST" }, { status: 201 }));
  await expect(
    rest.post(path, { detail: { invoice_number: "2026-27/0001" } }, "action-create", parse),
  ).resolves.toEqual({ id: "INV2-TEST" });
  const calls = fetcher.mock.calls.slice(1);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  for (const [, init] of calls) {
    const headers = new Headers(init?.headers);
    expect(headers.get("PayPal-Request-Id")).toBe("action-create");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe('{"detail":{"invoice_number":"2026-27/0001"}}');
  }
});

it("exposes only the status, error name and debug ID from an error body", async () => {
  const { fetcher, rest } = setup();
  fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(
    Response.json(
      {
        name: "INVALID_REQUEST",
        debug_id: "x",
        message: "private-token private-secret buyer@example.com",
      },
      { status: 400 },
    ),
  );
  await expect(rest.get(path, parse)).rejects.toEqual(
    new PayPalApiError(400, "INVALID_REQUEST", "x"),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("uses OAuth error names and clears a failed token request", async () => {
  const { fetcher, rest } = setup();
  fetcher
    .mockResolvedValueOnce(
      Response.json(
        { error: "invalid_client", error_description: "private-secret" },
        { status: 401 },
      ),
    )
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(Response.json({ id: "INV2-TEST" }));
  await expect(rest.get(path, parse)).rejects.toEqual(new PayPalApiError(401, "invalid_client"));
  await expect(rest.get(path, parse)).resolves.toEqual({ id: "INV2-TEST" });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each([
  new Response("not JSON private-token", { status: 400 }),
  Response.json({ message: "private-token" }, { status: 400 }),
])("falls back to HTTP status for an unrecognised error body", async (response) => {
  const { fetcher, rest } = setup();
  fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(response);
  await expect(rest.get(path, parse)).rejects.toEqual(new PayPalApiError(400, "HTTP_400"));
});

it.each([
  new Response("invalid JSON private-token"),
  Response.json({ id: 42, sensitive: "private-secret" }),
])("sanitizes invalid successful responses and parser failures", async (response) => {
  const { fetcher, rest } = setup();
  fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(response);
  await expect(rest.get(path, parse)).rejects.toEqual(new PayPalApiError(200, "INVALID_RESPONSE"));
});

it("validates OAuth responses without exposing tokens", async () => {
  const { fetcher, rest } = setup();
  fetcher.mockResolvedValueOnce(
    Response.json({ access_token: "private-token", expires_in: "private-secret" }),
  );
  await expect(rest.get(path, parse)).rejects.toEqual(new PayPalApiError(200, "INVALID_RESPONSE"));
});

it("passes undefined to the parser on 204 and sends JSON headers even without a body", async () => {
  const { fetcher, rest } = setup();
  const empty = vi.fn(z.undefined().parse);
  fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    rest.post(
      "/v2/invoicing/recurring-invoices/RI-TEST/activate",
      undefined,
      "action-activate",
      empty,
    ),
  ).resolves.toBeUndefined();
  expect(empty).toHaveBeenCalledWith(undefined);
  expect(fetcher.mock.calls[1]?.[1]).not.toHaveProperty("body");
  expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Content-Type")).toBe(
    "application/json",
  );
});

it("retries network errors once and hides their messages", async () => {
  const { fetcher, rest } = setup();
  fetcher
    .mockResolvedValueOnce(token())
    .mockRejectedValue(new Error("private-token private-secret"));
  await expect(rest.post(path, {}, "action-create", parse)).rejects.toEqual(
    new PayPalApiError(0, "NETWORK_ERROR"),
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[1]).toEqual(fetcher.mock.calls[2]);
});

it("recovers after a network error", async () => {
  const { fetcher, rest } = setup();
  fetcher
    .mockResolvedValueOnce(token())
    .mockRejectedValueOnce(new Error("private-token"))
    .mockResolvedValueOnce(Response.json({ id: "INV2-TEST" }));
  await expect(rest.get(path, parse)).resolves.toEqual({ id: "INV2-TEST" });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("stops after two 5xx responses", async () => {
  const { fetcher, rest } = setup();
  fetcher
    .mockResolvedValueOnce(token())
    .mockImplementation(async () =>
      Response.json({ name: "INTERNAL_SERVER_ERROR" }, { status: 500 }),
    );
  await expect(rest.get(path, parse)).rejects.toEqual(
    new PayPalApiError(500, "INTERNAL_SERVER_ERROR"),
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("rejects non-JSON request bodies before fetching", async () => {
  const { fetcher, rest } = setup();
  await expect(rest.post(path, { invalid: 1n }, "action-create", parse)).rejects.toEqual(
    new PayPalApiError(0, "INVALID_REQUEST"),
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["401", "503", "network", "read", "parse"])(
  "dispatches once and forbids redirects with retry false after %s",
  async (failure) => {
    const { fetcher, rest } = setup();
    fetcher.mockResolvedValueOnce(token()).mockImplementation(async () => {
      if (failure === "network") throw new Error("private transport detail");
      if (failure === "read") {
        const response = new Response(null, { status: 204 });
        vi.spyOn(response, "text").mockRejectedValue(new Error("private read detail"));
        return response;
      }
      if (failure === "parse") return new Response("invalid JSON");
      return Response.json({ name: "REQUEST_FAILED" }, { status: failure === "401" ? 401 : 503 });
    });
    await expect(
      rest.post(path, {}, "action-remind", z.json().optional().parse, { retry: false }),
    ).rejects.toBeInstanceOf(PayPalApiError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "POST", redirect: "error" });
  },
);

it("keeps OAuth retries and scopes the opt-out to one POST", async () => {
  const { fetcher, rest } = setup();
  fetcher
    .mockRejectedValueOnce(new Error("token network failure"))
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ name: "SERVICE_UNAVAILABLE" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ id: "INV2-TEST" }));
  await rest.post(path, {}, "once", z.undefined().parse, { retry: false });
  await expect(rest.post(path, {}, "retry", parse)).resolves.toEqual({ id: "INV2-TEST" });
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(fetcher.mock.calls[2]?.[1]?.redirect).toBe("error");
  expect(fetcher.mock.calls[3]?.[1]?.redirect).toBeUndefined();
  expect(fetcher.mock.calls[3]).toEqual(fetcher.mock.calls[4]);
});
