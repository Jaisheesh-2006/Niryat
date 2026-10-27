import { type Action, type Client, exportConditionIds } from "@niryat/shared";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActionButtons } from "./ActionButtons";
import { ClientForm } from "./ClientForm";
import { InvoiceForm } from "./InvoiceForm";

const { refresh, setState } = vi.hoisted(() => ({ refresh: vi.fn(), setState: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useId: () => "client-form",
  useState: (initial: unknown) => [initial, setState],
}));

const client: Client = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Acme Inc",
  email: "billing@example.com",
  address: "Client address",
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
      checkedOn: "2026-10-26",
      citation: { ruleId: "EXPORT_CONDITIONS", source: "Test reference", effectiveFrom: null },
      conditions: exportConditionIds.map((id) => ({
        id,
        status: "pass",
        reference: "Test reference",
        message: "Test condition",
      })),
    },
  },
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it.each([
  { mode: "create", editing: false, success: true },
  { mode: "edit", editing: true, success: true },
  { mode: "failed create", editing: false, success: false },
  { mode: "failed edit", editing: true, success: false },
])("$mode sends the right request and handles the save result", async ({ editing, success }) => {
  const data = new FormData();
  data.set("name", " Acme Inc ");
  data.set("country", " US ");
  data.set("email", " billing@example.com ");
  data.set("address", " Client address ");
  data.set("supplierInIndia", "yes");
  data.set("clientPresentInIndia", "no");
  data.set("paidInForeignCurrency", "no");
  const formData = vi.fn(
    class extends FormData {
      constructor() {
        super();
        for (const [name, value] of data) this.set(name, value);
      }
    },
  );
  vi.stubGlobal("FormData", formData);
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: editing ? 200 : 201 })
        : Response.json({ error: "invalid_request", fields: ["country"] }, { status: 400 }),
    );
  vi.stubGlobal("fetch", fetch);
  const form = { reset: vi.fn() };
  const preventDefault = vi.fn();
  let eventReleased = false;
  const event = {
    preventDefault,
    get currentTarget() {
      if (eventReleased) throw new Error("Read the form before awaiting the request");
      return form;
    },
  };
  const element = ClientForm(editing ? { client } : {});
  if (!isValidElement<{ onSubmit: (submitEvent: typeof event) => Promise<void> }>(element)) {
    throw new Error("Expected the client form");
  }
  const pending = element.props.onSubmit(event);
  eventReleased = true;
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(formData).toHaveBeenCalledExactlyOnceWith(form);
  expect(form.reset).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(setState).toHaveBeenCalledWith(true);
  await pending;

  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    editing ? `/api/clients/${client.id}` : "/api/clients",
    {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Acme Inc",
        country: "US",
        email: "billing@example.com",
        address: "Client address",
        answers: {
          supplierInIndia: true,
          clientPresentInIndia: false,
          paidInForeignCurrency: false,
          sameEstablishment: null,
        },
      }),
    },
  );
  expect(form.reset).toHaveBeenCalledTimes(success && !editing ? 1 : 0);
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(setState).toHaveBeenCalledWith(false);
  expect(setState).toHaveBeenLastCalledWith(success ? false : "Check these fields: Country code.");
});

it("prefills client email and address when editing", () => {
  const html = renderToStaticMarkup(<ClientForm client={client} />);
  expect(html).toContain('type="email"');
  expect(html).toContain('value="billing@example.com"');
  expect(html).toContain("Client address</textarea>");
});

const action: Action = {
  id: "10000000-0000-4000-8000-000000000002",
  paypalAction: "send_invoice",
  status: "proposed",
  payload: { invoice: "request" },
  error: null,
  createdAt: "2026-10-27T00:00:00Z",
};

it.each([
  ["proposed", "Waiting for your approval"],
  ["failed", "The last attempt failed (HTTP_502). You can approve again to retry."],
  ["approved", "Sending to PayPal…"],
  ["done", "Sent through PayPal."],
  ["rejected", "Rejected. Nothing was sent to PayPal."],
] as const)("renders the %s approval state without making a request", (status, message) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const html = renderToStaticMarkup(
    <ActionButtons action={{ ...action, status, error: "HTTP_502" }} />,
  );
  expect(html).toContain(message);
  expect(html.includes("<button")).toBe(status === "proposed" || status === "failed");
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["approve", true],
  ["reject", true],
  ["approve", false],
] as const)("sends only the clicked %s decision (success: %s)", async (decision, success) => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: 200 })
        : Response.json({ error: "action_not_pending" }, { status: 409 }),
    );
  vi.stubGlobal("fetch", fetch);
  const element = ActionButtons({ action });
  const button = Children.toArray(element.props.children).find(
    (child) =>
      isValidElement<{ children: unknown }>(child) &&
      child.type === "button" &&
      (decision === "reject"
        ? child.props.children === "Reject"
        : child.props.children !== "Reject"),
  );
  if (!isValidElement<{ onClick: () => Promise<void> }>(button))
    throw new Error("Expected a decision button");
  expect(fetch).not.toHaveBeenCalled();
  const pending = button.props.onClick();
  expect(setState).toHaveBeenCalledWith(true);
  await pending;
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/actions/${action.id}/${decision}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(setState).toHaveBeenCalledWith(false);
  if (!success)
    expect(setState).toHaveBeenLastCalledWith("This action was already handled. Refresh the page.");
});

it("labels the recurring approval and blocked client without disabling them", () => {
  expect(
    renderToStaticMarkup(
      <ActionButtons action={{ ...action, paypalAction: "create_recurring_series" }} />,
    ),
  ).toContain("Approve and start the PayPal series");
  const html = renderToStaticMarkup(
    <InvoiceForm
      clients={[
        {
          ...client,
          exportCheck: {
            ...client.exportCheck,
            result: { ...client.exportCheck.result, eligible: false },
          },
        },
      ]}
    />,
  );
  expect(html).toContain("Acme Inc (US) — export check blocked");
  expect(html).toContain('inputMode="decimal"');
});

it.each([true, false])("handles invoice issuance (success: %s)", async (success) => {
  vi.stubGlobal(
    "FormData",
    class extends FormData {
      constructor() {
        super();
        this.set("type", "one_time");
        this.set("amount", "1500.00");
      }
    },
  );
  const reasons = ["Complete your compliance profile before issuing invoices."];
  const fetch = vi
    .fn()
    .mockResolvedValue(
      success
        ? new Response(null, { status: 201 })
        : Response.json({ error: "invoice_blocked", reasons }, { status: 422 }),
    );
  vi.stubGlobal("fetch", fetch);
  const form = { reset: vi.fn() };
  const event = { preventDefault: vi.fn(), currentTarget: form };
  const element = InvoiceForm({ clients: [client] });
  if (!isValidElement<{ onSubmit: (submitEvent: typeof event) => Promise<void> }>(element))
    throw new Error("Expected invoice form");
  await element.props.onSubmit(event);
  expect(fetch).toHaveBeenCalledWith("/api/invoices", expect.objectContaining({ method: "POST" }));
  expect(form.reset).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
  if (!success) {
    expect(setState).toHaveBeenCalledWith("This invoice cannot be issued yet:");
    expect(setState).toHaveBeenLastCalledWith(reasons);
  }
});
