import { afterEach, expect, it, vi } from "vitest";
import { clientBody, profileBody, sendJson, text, wholeNumber, yesNo } from "./forms";

afterEach(() => vi.unstubAllGlobals());

it("converts profile form fields to their request values", () => {
  const form = new FormData();
  form.set("gstRegistered", "yes");
  form.set("gstin", "  ");
  form.set("workType", " Software development ");
  form.set("expectedTurnoverInr", "1800000");
  expect(profileBody(form)).toEqual({
    gstRegistered: true,
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
  expect(clientBody(form)).toEqual({
    name: "Acme Inc",
    country: "US",
    answers: {
      supplierInIndia: null,
      clientPresentInIndia: null,
      paidInForeignCurrency: null,
      sameEstablishment: null,
    },
  });
});

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
  ["other", "Something went wrong. Try again."],
])("maps the %s error", async (error, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 })));
  expect(await sendJson("/api/auth/login", "POST", {})).toEqual({ ok: false, message });
});

it.each(["not JSON", JSON.stringify({ error: 42 })])(
  "handles malformed error responses",
  async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 500 })));
    expect(await sendJson("/api/auth/login", "POST", {})).toEqual({
      ok: false,
      message: "Something went wrong. Try again.",
    });
  },
);

it("handles network failures without exposing the error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private transport detail")));
  expect(await sendJson("/api/auth/login", "POST", {})).toEqual({
    ok: false,
    message: "Something went wrong. Try again.",
  });
});
