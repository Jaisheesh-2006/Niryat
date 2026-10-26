import { expect, it, vi } from "vitest";
import { createPayPalRestClient, PayPalApiError, verifyWebhookSignature } from "../index";

const headerValues = {
  "paypal-transmission-id": "transmission-id",
  "paypal-transmission-time": "2026-10-26T12:00:00Z",
  "paypal-transmission-sig": "signature",
  "paypal-cert-url": "https://api-m.sandbox.paypal.com/v1/notifications/certs/TEST",
  "paypal-auth-algo": "SHA256withRSA",
};
const event = {
  id: "WH-TEST",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "CAPTURE-TEST" },
};

function setup() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ access_token: "private-token", expires_in: 3600 }));
  const rest = createPayPalRestClient({
    clientId: "test",
    clientSecret: "private-secret",
    fetch: fetcher,
  });
  return { fetcher, rest };
}

it.each(Object.keys(headerValues))(
  "returns false without fetching when %s is missing",
  async (name) => {
    const { fetcher, rest } = setup();
    const headers = new Headers(headerValues);
    headers.delete(name);
    await expect(
      verifyWebhookSignature({ headers, event, webhookId: "webhook-id" }, rest),
    ).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each(["SUCCESS", "FAILURE"])("returns the verification result for %s", async (status) => {
  const { fetcher, rest } = setup();
  fetcher.mockResolvedValueOnce(Response.json({ verification_status: status }));
  await expect(
    verifyWebhookSignature(
      { headers: new Headers(headerValues), event, webhookId: "webhook-id" },
      rest,
    ),
  ).resolves.toBe(status === "SUCCESS");
  const call = fetcher.mock.calls[1];
  expect(call?.[0]).toBe(
    "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature",
  );
  expect(call?.[1]?.body).toBe(
    JSON.stringify({
      auth_algo: "SHA256withRSA",
      cert_url: headerValues["paypal-cert-url"],
      transmission_id: "transmission-id",
      transmission_sig: "signature",
      transmission_time: headerValues["paypal-transmission-time"],
      webhook_id: "webhook-id",
      webhook_event: event,
    }),
  );
  expect(new Headers(call?.[1]?.headers).get("PayPal-Request-Id")).toBe("transmission-id");
});

it("throws after a 500 so webhook ingestion can be retried", async () => {
  const { fetcher, rest } = setup();
  fetcher.mockImplementation(async () =>
    Response.json({ name: "INTERNAL_SERVER_ERROR" }, { status: 500 }),
  );
  await expect(
    verifyWebhookSignature(
      { headers: new Headers(headerValues), event, webhookId: "webhook-id" },
      rest,
    ),
  ).rejects.toEqual(new PayPalApiError(500, "INTERNAL_SERVER_ERROR"));
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("throws on an invalid verification response", async () => {
  const { fetcher, rest } = setup();
  fetcher.mockResolvedValueOnce(Response.json({ verification_status: "unexpected private-token" }));
  await expect(
    verifyWebhookSignature(
      { headers: new Headers(headerValues), event, webhookId: "webhook-id" },
      rest,
    ),
  ).rejects.toEqual(new PayPalApiError(200, "INVALID_RESPONSE"));
});

it("validates the event object before fetching", async () => {
  const { fetcher, rest } = setup();
  await expect(
    verifyWebhookSignature(
      { headers: new Headers(headerValues), event: null, webhookId: "webhook-id" },
      rest,
    ),
  ).rejects.toEqual(new PayPalApiError(0, "INVALID_REQUEST"));
  expect(fetcher).not.toHaveBeenCalled();
});
