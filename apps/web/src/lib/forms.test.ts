import type { Action } from "@niryat/shared";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ActionButtons } from "../components/ActionButtons";
import { RefundForm } from "../components/RefundForm";
import { TaskDoneButton } from "../components/TaskDoneButton";
import {
  clientBody,
  invoiceBody,
  profileBody,
  refundBody,
  sendJson,
  text,
  wholeNumber,
  yesNo,
} from "./forms";

const { refresh, setState } = vi.hoisted(() => ({ refresh: vi.fn(), setState: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useId: () => "refund-amount",
  useState: (initial: unknown) => [initial, setState],
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("keeps the refund amount as a decimal string", () => {
  const form = new FormData();
  form.set("amount", " 40.00 ");
  expect(refundBody(form)).toEqual({ amount: "40.00" });
});

it.each([true, false])("proposes a refund and handles success: %s", async (success) => {
  vi.stubGlobal(
    "FormData",
    class extends FormData {
      constructor() {
        super();
        this.set("amount", "40.00");
      }
    },
  );
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: 201 })
        : Response.json({ error: "refund_pending" }, { status: 409 }),
    );
  vi.stubGlobal("fetch", fetch);
  const element = RefundForm({ paymentId: "payment-id", currency: "USD" });
  const event = { preventDefault: vi.fn(), currentTarget: {} };
  if (!isValidElement<{ onSubmit: (submitEvent: typeof event) => Promise<void> }>(element))
    throw new Error("Expected refund form");
  expect(fetch).not.toHaveBeenCalled();
  await element.props.onSubmit(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/payments/payment-id/refunds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"amount":"40.00"}',
  });
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(setState).toHaveBeenCalledWith(false);
  if (!success)
    expect(setState).toHaveBeenLastCalledWith(
      "A refund for this payment is already waiting for your approval.",
    );
});

it.each([true, false])("marks a task done and handles success: %s", async (success) => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: 200 })
        : Response.json({ error: "not_found" }, { status: 404 }),
    );
  vi.stubGlobal("fetch", fetch);
  const element = TaskDoneButton({ taskId: "task-id" });
  const button = Children.toArray(element.props.children).find(
    (child) => isValidElement(child) && child.type === "button",
  );
  if (!isValidElement<{ onClick: () => Promise<void> }>(button))
    throw new Error("Expected task button");
  expect(fetch).not.toHaveBeenCalled();
  await button.props.onClick();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/tasks/task-id/done", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(setState).toHaveBeenCalledWith(false);
  if (!success) expect(setState).toHaveBeenLastCalledWith("Not found. Refresh the page.");
});

it("labels refund approval and completion without sending a request", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const action: Action = {
    id: "10000000-0000-4000-8000-000000000001",
    paymentId: "10000000-0000-4000-8000-000000000002",
    paypalAction: "refund_payment",
    status: "proposed",
    payload: {},
    error: null,
    createdAt: "2026-10-29T00:00:00Z",
  };
  const html = renderToStaticMarkup(createElement(ActionButtons, { action }));
  expect(html).toContain("Approve and refund through PayPal");
  expect(
    renderToStaticMarkup(createElement(ActionButtons, { action: { ...action, status: "done" } })),
  ).toContain("Refund sent to PayPal.");
  expect(fetch).not.toHaveBeenCalled();
});

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
  ["refund_pending", "A refund for this payment is already waiting for your approval."],
  ["refund_exceeds_payment", "The refund is more than what is left to refund on this payment."],
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
