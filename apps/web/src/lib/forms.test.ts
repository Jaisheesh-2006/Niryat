import { afterEach, expect, it, vi } from "vitest";
import { clientBody, invoiceBody, profileBody, sendJson, text, wholeNumber, yesNo } from "./forms";

afterEach(() => vi.unstubAllGlobals());

it("converts profile form fields to their request values", () => {
  const form = new FormData();
  form.set("gstRegistered", "yes");
  form.set("legalName", " Test Supplier ");
  form.set("address", " Business address ");
  form.set("gstin", "  ");
  form.set("workType", " Software development ");
  form.set("expectedTurnoverInr", "1800000");
  expect(profileBody(form)).toEqual({
    gstRegistered: true,
    legalName: "Test Supplier",
    address: "Business address",
    gstin: null,
    lutNumber: null,
    lutValidFrom: null,
    lutValidTo: null,
    workType: "Software development",
    purposeCode: null,
    panLast4: null,
    expectedTurnoverInr: 1800000,
  });
});

it("keeps unanswered client questions null and trims the country", () => {
  const form = new FormData();
  form.set("name", " Acme Inc ");
  form.set("country", " US ");
  form.set("email", " billing@example.com ");
  form.set("address", " Client address ");
  expect(clientBody(form)).toEqual({
    name: "Acme Inc",
    country: "US",
    email: "billing@example.com",
    address: "Client address",
    answers: {
      supplierInIndia: null,
      clientPresentInIndia: null,
      paidInForeignCurrency: null,
      sameEstablishment: null,
    },
  });
});

it.each(["one_time", "recurring"])("builds a %s invoice without converting money", (type) => {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    clientId: "10000000-0000-4000-8000-000000000001",
    type,
    description: " Software development ",
    sac: "998314",
    currency: "USD",
    amount: "1500.00",
    intervalUnit: "MONTH",
    intervalCount: "1",
    totalCycles: "2",
  }))
    form.set(name, value);
  expect(invoiceBody(form)).toEqual({
    clientId: "10000000-0000-4000-8000-000000000001",
    type,
    description: "Software development",
    sac: "998314",
    currency: "USD",
    amount: "1500.00",
    recurrence:
      type === "recurring" ? { intervalUnit: "MONTH", intervalCount: 1, totalCycles: 2 } : null,
  });
});

it("maps invoice blockers and preserves their reasons", async () => {
  const reasons = ["Complete your compliance profile before issuing invoices."];
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ error: "invoice_blocked", reasons }, { status: 422 })),
  );
  expect(await sendJson("/api/invoices", "POST", {})).toEqual({
    ok: false,
    message: "This invoice cannot be issued yet:",
    reasons,
  });
});

it.each(["HTTP_502", "invalid_client", "invalid_payload", "unexpected_error"])(
  "maps the %s failure using only its error name",
  async (code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "paypal_failed", code }, { status: 502 })),
    );
    expect(await sendJson("/api/actions/test/approve", "POST", {})).toEqual({
      ok: false,
      message: `PayPal did not accept the request (${code}). Nothing else was sent. You can approve again to retry.`,
    });
  },
);

it("handles missing, non-string and yes/no form fields", () => {
  const form = new FormData();
  expect(text(form, "value")).toBeNull();
  form.set("value", new Blob(["file"]));
  expect(text(form, "value")).toBeNull();
  for (const [value, expected] of [
    ["yes", true],
    ["no", false],
    ["other", null],
  ] as const) {
    form.set("value", value);
    expect(yesNo(form, "value")).toBe(expected);
  }
});

it.each([
  ["", null],
  ["  ", null],
  [" 42 ", 42],
  ["1.5", 1.5],
  ["-1", -1],
  ["invalid", "invalid"],
  ["Infinity", "Infinity"],
])("converts numeric form value %s without hiding invalid input", (value, expected) => {
  const form = new FormData();
  form.set("value", value);
  expect(wholeNumber(form, "value")).toBe(expected);
  expect(wholeNumber(form, "missing")).toBeNull();
});

it("sends JSON and maps API field errors to labels", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { error: "invalid_request", fields: ["gstin", "answers.sameEstablishment", "other"] },
        { status: 400 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  expect(await sendJson("/api/profile", "PUT", { gstin: "invalid" })).toEqual({
    ok: false,
    message: "Check these fields: GSTIN, Own establishment, other.",
  });
  expect(fetch).toHaveBeenCalledWith("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gstin: "invalid" }),
  });
});

it("maps the specified pair of invalid fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "invalid_request", fields: ["gstin", "answers.sameEstablishment"] },
          { status: 400 },
        ),
      ),
  );
  expect(await sendJson("/api/profile", "PUT", {})).toEqual({
    ok: false,
    message: "Check these fields: GSTIN, Own establishment.",
  });
});

it("accepts a 204 without attempting to parse JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  expect(await sendJson("/api/auth/logout", "POST", {})).toEqual({ ok: true });
});

it.each([
  ["email_taken", "That email is already registered. Sign in instead."],
  ["invalid_credentials", "Email or password is incorrect."],
  ["unauthenticated", "Your session has ended. Sign in again."],
  ["action_not_pending", "This action was already handled. Refresh the page."],
  ["paypal_unavailable", "PayPal is not configured on this server."],
  ["file_storage_unavailable", "File storage is not configured on this server."],
  ["not_found", "Not found. Refresh the page."],
  ["other", "Something went wrong. Try again."],
])("maps the %s error", async (error, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 })));
  expect(await sendJson("/api/auth/login", "POST", {})).toEqual({ ok: false, message });
});

it.each([
  "not JSON",
  JSON.stringify({ error: 42 }),
  JSON.stringify({ error: "invoice_blocked", reasons: [42] }),
  JSON.stringify({ error: "paypal_failed" }),
  JSON.stringify({ error: "paypal_failed", code: "private transport detail" }),
])("handles malformed error responses", async (body) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 500 })));
  expect(await sendJson("/api/auth/login", "POST", {})).toEqual({
    ok: false,
    message: "Something went wrong. Try again.",
  });
});

it("handles network failures without exposing the error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private transport detail")));
  expect(await sendJson("/api/auth/login", "POST", {})).toEqual({
    ok: false,
    message: "Something went wrong. Try again.",
  });
});
