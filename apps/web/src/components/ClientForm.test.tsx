import { type Client, exportConditionIds } from "@niryat/shared";
import { isValidElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClientForm } from "./ClientForm";

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
