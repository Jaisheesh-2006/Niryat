import {
  type Action,
  type Client,
  type ExtractionResult,
  exportConditionIds,
  extractionFieldNames,
  extractionResultSchema,
} from "@niryat/shared";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Fira from "../app/fira/page";
import { ActionButtons } from "../components/ActionButtons";
import { ClientForm } from "../components/ClientForm";
import { ExtractPanel } from "../components/ExtractPanel";
import { FiraLineButtons } from "../components/FiraLineButtons";
import { FiraUpload } from "../components/FiraUpload";
import { InvoiceForm } from "../components/InvoiceForm";
import { RefundForm } from "../components/RefundForm";
import { TaskDoneButton } from "../components/TaskDoneButton";
import { apiGet } from "./api";
import {
  clientBody,
  daysRemainingLabel,
  invoiceBody,
  profileBody,
  refundBody,
  sendJson,
  sendPdf,
  text,
  wholeNumber,
  yesNo,
} from "./forms";

const { refresh, setState } = vi.hoisted(() => ({ refresh: vi.fn(), setState: vi.fn() }));
const panelState = vi.hoisted(() => ({
  values: [] as unknown[],
  hooks: null as unknown[] | null,
  cursor: 0,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./api", () => ({ apiGet: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useId: () => "refund-amount",
  useState: (initial: unknown) => {
    const hooks = panelState.hooks;
    if (!hooks) return [panelState.values.length ? panelState.values.shift() : initial, setState];
    const index = panelState.cursor++;
    if (!(index in hooks)) hooks[index] = initial;
    return [
      hooks[index],
      (value: unknown) => {
        hooks[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    if (!panelState.hooks) return { current: initial };
    const index = panelState.cursor++;
    if (!(index in panelState.hooks)) panelState.hooks[index] = { current: initial };
    return panelState.hooks[index];
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  panelState.values = [];
  panelState.hooks = null;
  panelState.cursor = 0;
});

it.each([
  ["close_running", "A close is already running. Wait for it to finish."],
  ["ai_unavailable", "AI is not configured, so extraction is unavailable. Fill in the form below."],
  ["ai_budget_exhausted", "The monthly AI budget is used up. Fill in the form below."],
  ["extraction_running", "An extraction is already running."],
  ["extraction_failed", "Claude could not extract details from this text. Fill in the form below."],
])("explains %s", async (error, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error }, { status: 503 })));
  expect(await sendJson("/api/extract", "POST", { text: "test" })).toEqual({ ok: false, message });
});

it.each([
  [0, "Due today"],
  [1, "1"],
  [5, "5"],
  [-1, "Overdue by 1 day"],
  [-3, "Overdue by 3 days"],
])("formats %s days remaining", (days, label) => {
  expect(daysRemainingLabel(Number(days))).toBe(label);
});

it.each([
  ["reminder_not_needed", "This invoice no longer needs a reminder. Reject this proposal."],
  [
    "reminder_outcome_unknown",
    "PayPal may have accepted this reminder. Check PayPal before taking further action. This reminder cannot be resent.",
  ],
])("explains %s without offering a retry", async (code, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "paypal_failed", code }, { status: 502 })),
  );
  expect(await sendJson("/api/actions/test/approve", "POST", {})).toEqual({ ok: false, message });
  expect(await sendJson("/api/actions/test/approve", "POST", {}, "reminder_approval")).toEqual({
    ok: false,
    message,
  });
});

it.each(["INVALID_REQUEST", "HTTP_401", "invalid_payload"])(
  "does not offer a retry for reminder rejection %s",
  async (code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "paypal_failed", code }, { status: 502 })),
    );
    expect(await sendJson("/api/actions/test/approve", "POST", {}, "reminder_approval")).toEqual({
      ok: false,
      message:
        "The reminder attempt failed. This reminder cannot be retried. You can reject this proposal.",
    });
  },
);

it.each(["interrupted", "unreadable", "missing code", "unknown error"])(
  "asks to reload after %s reminder approval",
  async (failure) => {
    const fetch = vi.fn();
    if (failure === "interrupted") fetch.mockRejectedValue(new Error("interrupted"));
    else if (failure === "unreadable")
      fetch.mockResolvedValue(new Response("invalid", { status: 502 }));
    else
      fetch.mockResolvedValue(
        Response.json(
          { error: failure === "missing code" ? "paypal_failed" : "unexpected" },
          { status: 502 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await sendJson("/api/actions/test/approve", "POST", {}, "reminder_approval")).toEqual({
      ok: false,
      message:
        "Unable to confirm this reminder's status. Reload this page to check it before taking further action.",
    });
  },
);

const extraction: ExtractionResult = extractionResultSchema.parse({
  fields: {
    ...Object.fromEntries(
      extractionFieldNames.map((name) => [name, { value: null, source: null }]),
    ),
    clientName: { value: "Acme Inc", source: "Acme Inc" },
    clientEmail: { value: "billing@acme.example", source: "billing@acme.example" },
    clientCountry: { value: "US", source: "New York" },
    description: { value: "Dashboard work", source: "Dashboard work" },
    amount: { value: "1500", source: "1,500" },
  },
  matchedClientId: null,
});

it("validates successful extraction responses before returning them", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(extraction))
      .mockResolvedValueOnce(Response.json({ fields: {} })),
  );
  expect(await sendJson("/api/extract", "POST", {}, extractionResultSchema)).toEqual({
    ok: true,
    data: extraction,
  });
  expect(await sendJson("/api/extract", "POST", {}, extractionResultSchema)).toEqual({
    ok: false,
    message: "Something went wrong. Try again.",
  });
});

it("submits extraction once while busy and handles an error without saving", async () => {
  const brief = "Please invoice Acme Inc USD 1,500 for dashboard work.";
  panelState.values = [brief, false, "", null, false, null];
  const element = ExtractPanel({ clients: [] });
  const form = Children.toArray(element.props.children).find(
    (child) => isValidElement(child) && child.type === "form",
  );
  if (!isValidElement<{ onSubmit: (event: { preventDefault: () => void }) => Promise<void> }>(form))
    throw new Error("Expected extraction form");
  const response = Promise.withResolvers<Response>();
  const fetch = vi.fn().mockReturnValue(response.promise);
  vi.stubGlobal("fetch", fetch);
  const pending = form.props.onSubmit({ preventDefault: vi.fn() });
  await form.props.onSubmit({ preventDefault: vi.fn() });
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: brief }),
  });
  response.resolve(Response.json({ error: "extraction_failed" }, { status: 502 }));
  await pending;
  expect(setState).toHaveBeenCalledWith(
    "Claude could not extract details from this text. Fill in the form below.",
  );
  expect(setState).toHaveBeenLastCalledWith(false);
  expect(refresh).not.toHaveBeenCalled();
});

it("shows source quotes and Discard clears extraction without a request", () => {
  panelState.values = ["private email text", false, "", extraction, false, null];
  const element = ExtractPanel({ clients: [] });
  const html = renderToStaticMarkup(element);
  expect(html).toContain("Start from a client email");
  expect(html).toContain("Source text");
  expect(html).toContain("1,500");
  expect(html).toContain("Not found");
  expect(html).toContain(
    "Extracted by Claude from your text. Check every value before you use it.",
  );
  const result = Children.toArray(element.props.children).find(
    (child) =>
      isValidElement<{ children: ReactNode }>(child) &&
      Children.toArray(child.props.children).some(
        (nested) =>
          isValidElement<{ children: unknown }>(nested) && nested.props.children === "Discard",
      ),
  );
  if (!isValidElement<{ children: ReactNode }>(result))
    throw new Error("Expected extraction results");
  const buttons = Children.toArray(result.props.children);
  const discard = buttons.find(
    (child) => isValidElement<{ children: unknown }>(child) && child.props.children === "Discard",
  );
  const use = buttons.find(
    (child) =>
      isValidElement<{ children: unknown }>(child) && child.props.children === "Use these values",
  );
  if (
    !isValidElement<{ onClick: () => void }>(discard) ||
    !isValidElement<{ onClick: () => void }>(use)
  )
    throw new Error("Expected extraction choices");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  use.props.onClick();
  expect(setState).toHaveBeenCalledWith(true);
  discard.props.onClick();
  expect(setState).toHaveBeenCalledWith(null);
  expect(setState).toHaveBeenCalledWith(false);
  expect(setState).toHaveBeenCalledWith("");
  expect(fetch).not.toHaveBeenCalled();
});

it("waits for new-client confirmation and leaves export answers blank", () => {
  panelState.values = ["email", false, "", extraction, true, null];
  const html = renderToStaticMarkup(createElement(ExtractPanel, { clients: [] }));
  expect(html).toContain("New client from the email");
  expect(html).toContain('value="Acme Inc"');
  expect(html).not.toContain('checked=""');
  expect(html).not.toContain("Issue invoice");
});

const extractedClient: Client = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Acme Inc",
  email: "billing@acme.example",
  address: null,
  country: "US",
  exportCheck: {
    answers: {
      supplierInIndia: true,
      clientPresentInIndia: false,
      paidInForeignCurrency: true,
      sameEstablishment: false,
    },
    result: {
      eligible: true,
      conditions: exportConditionIds.map((id) => ({
        id,
        status: "pass",
        reference: "Test",
        message: "Test",
      })),
      citation: { ruleId: "EXPORT_CONDITIONS", source: "Test", effectiveFrom: null },
      checkedOn: "2026-10-30",
    },
  },
};
it("uses a validated created client callback to prefill the invoice and leaves SAC blank", async () => {
  const client = extractedClient;
  const onCreated = vi.fn();
  const fetch = vi.fn().mockResolvedValue(Response.json(client, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal(
    "FormData",
    class extends FormData {
      constructor() {
        super();
        this.set("name", "Acme Inc");
      }
    },
  );
  const element = ClientForm({ onCreated });
  const form = { reset: vi.fn() };
  if (
    !isValidElement<{
      onSubmit: (event: {
        preventDefault: () => void;
        currentTarget: typeof form;
      }) => Promise<void>;
    }>(element)
  )
    throw new Error("Expected client form");
  await element.props.onSubmit({ preventDefault: vi.fn(), currentTarget: form });
  expect(onCreated).toHaveBeenCalledExactlyOnceWith(client);
  panelState.values = ["email", false, "", extraction, true, client];
  const html = renderToStaticMarkup(createElement(ExtractPanel, { clients: [] }));
  expect(html).toContain('value="1500"');
  expect(html).toContain("Dashboard work</textarea>");
  expect(html).toContain(`value="${client.id}" selected=""`);
  const sac = html.match(/<input[^>]*name="sac"[^>]*>/)?.[0];
  expect(sac).toContain('required=""');
  expect(sac).not.toContain("value=");
  expect(html).not.toContain("New client from the email");
  panelState.values = [
    "email",
    false,
    "",
    { ...extraction, matchedClientId: client.id },
    true,
    null,
  ];
  expect(renderToStaticMarkup(createElement(ExtractPanel, { clients: [client] }))).toContain(
    "Matched your existing client Acme Inc.",
  );
});

it.each(["current extraction", "new extraction", "discard"] as const)(
  "applies a delayed client save only to its own active extraction: %s",
  async (action) => {
    const beta: Client = {
      ...extractedClient,
      id: "20000000-0000-4000-8000-000000000002",
      name: "Beta Inc",
      email: "billing@beta.example",
    };
    const betaExtraction: ExtractionResult = {
      ...extraction,
      matchedClientId: beta.id,
      fields: { ...extraction.fields, description: { value: "Beta work", source: "Beta work" } },
    };
    const saved = Promise.withResolvers<Response>();
    const nextExtraction = Promise.withResolvers<Response>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(extraction))
      .mockReturnValueOnce(saved.promise)
      .mockReturnValueOnce(nextExtraction.promise);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal(
      "FormData",
      class extends FormData {
        constructor() {
          super();
          this.set("name", "Acme Inc");
        }
      },
    );
    const hooks: unknown[] = [];
    function descendants(node: ReactNode): ReactElement<{ children?: ReactNode }>[] {
      return Children.toArray(node).flatMap((child) =>
        isValidElement<{ children?: ReactNode }>(child)
          ? [child, ...descendants(child.props.children)]
          : [],
      );
    }
    function render() {
      panelState.hooks = hooks;
      panelState.cursor = 0;
      return descendants(ExtractPanel({ clients: [beta] }));
    }
    function click(label: string) {
      const button = render().find(
        (element) => element.type === "button" && element.props.children === label,
      );
      if (!isValidElement<{ onClick: () => void }>(button))
        throw new Error("Expected extraction choice");
      button.props.onClick();
    }
    function extract() {
      const form = render().find((element) => element.type === "form");
      if (
        !isValidElement<{ onSubmit: (event: { preventDefault: () => void }) => Promise<void> }>(
          form,
        )
      )
        throw new Error("Expected extraction form");
      return form.props.onSubmit({ preventDefault: vi.fn() });
    }
    await extract();
    click("Use these values");
    const newClient = render().find((element) => element.type === ClientForm);
    if (!isValidElement<Parameters<typeof ClientForm>[0]>(newClient))
      throw new Error("Expected new-client form");
    panelState.hooks = null;
    const form = ClientForm(newClient.props);
    const currentTarget = { reset: vi.fn() };
    if (
      !isValidElement<{
        onSubmit: (event: {
          preventDefault: () => void;
          currentTarget: typeof currentTarget;
        }) => Promise<void>;
      }>(form)
    )
      throw new Error("Expected client form");
    const pendingSave = form.props.onSubmit({ preventDefault: vi.fn(), currentTarget });
    const pendingExtraction = action === "new extraction" ? extract() : undefined;
    if (action === "discard") click("Discard");
    saved.resolve(Response.json(extractedClient, { status: 201 }));
    await pendingSave;
    if (pendingExtraction) {
      nextExtraction.resolve(Response.json(betaExtraction));
      await pendingExtraction;
      click("Use these values");
    }
    const invoice = render().find((element) => element.type === InvoiceForm);
    if (!isValidElement<Parameters<typeof InvoiceForm>[0]>(invoice))
      throw new Error("Expected invoice form");
    if (action === "current extraction") {
      expect(invoice.props.defaults?.clientId).toBe(extractedClient.id);
    } else {
      expect(invoice.props.clients.map((client) => client.id)).toEqual([beta.id]);
      expect(invoice.props.defaults?.clientId).toBe(
        action === "new extraction" ? beta.id : undefined,
      );
      expect(invoice.props.defaults?.description).toBe(
        action === "new extraction" ? "Beta work" : undefined,
      );
    }
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(
      action === "new extraction"
        ? ["/api/extract", "/api/clients", "/api/extract"]
        : ["/api/extract", "/api/clients"],
    );
  },
);

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

it("posts the PDF unchanged with content type and consent headers", async () => {
  const file = new File(["synthetic PDF"], "fira.pdf", { type: "application/pdf" });
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  expect(await sendPdf("/api/fira", file)).toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/fira", {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "X-Niryat-Consent": "own-fira" },
    body: file,
  });
});

it.each([
  ["fira_duplicate", "This FIRA was already uploaded."],
  [
    "fira_unreadable",
    "Niryat could not read FIRA lines from this PDF. Upload the digital FIRA PDF from PayPal, not a scan.",
  ],
  ["consent_required", "Confirm that this is your own FIRA before uploading."],
  ["file_too_large", "The PDF is larger than 2 MB."],
  ["no_suggestion", "This line has no suggested match to confirm or reject. Refresh the page."],
])("maps %s for both PDF and JSON requests", async (error, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json({ error }, { status: 400 })),
  );
  expect(await sendPdf("/api/fira", new File([], "fira.pdf"))).toEqual({ ok: false, message });
  expect(await sendJson("/api/fira/lines/line-id/confirm", "POST", {})).toEqual({
    ok: false,
    message,
  });
});

it.each(["network", "malformed"])(
  "handles a PDF %s failure without exposing details",
  async (kind) => {
    vi.stubGlobal(
      "fetch",
      kind === "network"
        ? vi.fn().mockRejectedValue(new Error("private transport detail"))
        : vi.fn().mockResolvedValue(new Response("private response", { status: 500 })),
    );
    expect(await sendPdf("/api/fira", new File([], "fira.pdf"))).toEqual({
      ok: false,
      message: "Something went wrong. Try again.",
    });
  },
);

it.each([true, false])("uploads a consented FIRA and handles success: %s", async (success) => {
  const file = new File(["synthetic PDF"], "fira.pdf", { type: "application/pdf" });
  vi.stubGlobal(
    "FormData",
    class extends FormData {
      constructor() {
        super();
        this.set("file", file);
        this.set("consent", "on");
      }
    },
  );
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: 201 })
        : Response.json({ error: "fira_duplicate" }, { status: 409 }),
    );
  vi.stubGlobal("fetch", fetch);
  const element = FiraUpload();
  expect(fetch).not.toHaveBeenCalled();
  await element.props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/fira", {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "X-Niryat-Consent": "own-fira" },
    body: file,
  });
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(setState).toHaveBeenCalledWith(false);
  if (!success) expect(setState).toHaveBeenLastCalledWith("This FIRA was already uploaded.");
});

it.each(["consent", "file"])("does not upload when %s is missing", async (missing) => {
  vi.stubGlobal(
    "FormData",
    class extends FormData {
      constructor() {
        super();
        if (missing !== "file") this.set("file", new File(["PDF"], "fira.pdf"));
        if (missing !== "consent") this.set("consent", "on");
      }
    },
  );
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await FiraUpload().props.onSubmit({ preventDefault: vi.fn(), currentTarget: {} });
  expect(fetch).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(setState).toHaveBeenLastCalledWith(
    missing === "consent"
      ? "Confirm that this is your own FIRA before uploading."
      : "Niryat could not read FIRA lines from this PDF. Upload the digital FIRA PDF from PayPal, not a scan.",
  );
});

it.each([
  ["confirm", true],
  ["reject", true],
  ["confirm", false],
  ["reject", false],
] as const)("submits %s match and handles success: %s", async (decision, success) => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: 200 })
        : Response.json({ error: "no_suggestion" }, { status: 409 }),
    );
  vi.stubGlobal("fetch", fetch);
  const element = FiraLineButtons({ lineId: "line-id" });
  const buttons = Children.toArray(element.props.children).filter(
    (child) => isValidElement(child) && child.type === "button",
  );
  const button = buttons[decision === "confirm" ? 0 : 1];
  if (!isValidElement<{ onClick: () => Promise<void> }>(button))
    throw new Error("Expected match button");
  expect(fetch).not.toHaveBeenCalled();
  await button.props.onClick();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/fira/lines/line-id/${decision}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(setState).toHaveBeenCalledWith(false);
  if (!success)
    expect(setState).toHaveBeenLastCalledWith(
      "This line has no suggested match to confirm or reject. Refresh the page.",
    );
});

it("shows matched, uncertain and flagged FIRA lines beside their source text", async () => {
  vi.mocked(apiGet).mockResolvedValueOnce([
    {
      id: "document-id",
      month: "2026-10-01",
      uploadedAt: "2026-10-29T20:00:00Z",
      lines: ["matched", "needs_confirmation", null].map((state, position) => ({
        id: `line-${position}`,
        position,
        date: "2026-10-20",
        amount: "40.00",
        currency: "USD",
        reference: `reference-${position}`,
        purposeCode: null,
        sourceText: `source <text> ${position}`,
        note: `note ${position}`,
        match: state
          ? {
              paymentId: `payment-${position}`,
              paypalTxnId: `transaction-${position}`,
              invoiceId: `invoice-${position}`,
              invoiceNumber: `DEMO-${position}`,
              confidence: state === "matched" ? "1.00" : "0.70",
              state,
            }
          : null,
      })),
    },
  ]);
  const html = renderToStaticMarkup(await Fira());
  expect(apiGet).toHaveBeenCalledWith("/fira", expect.anything());
  for (const expected of [
    "FIRA matching",
    "FIRA for October 2026",
    "Uploaded 2026-10-30",
    "USD 40.00",
    "Not shown",
    "Payment transaction-0 (invoice DEMO-0)",
    "100%",
    "70%",
    "<strong>Flagged</strong> note 2",
    "—",
    "source &lt;text&gt; 0",
    "note 1",
    'accept="application/pdf"',
    'type="checkbox" required=""',
  ])
    expect(html).toContain(expected);
  expect(html.match(/Confirm match/g)).toHaveLength(1);
  expect(html.match(/Reject match/g)).toHaveLength(1);
  expect(html.match(/<summary>Source text<\/summary>/g)).toHaveLength(3);
});
