import { randomBytes, randomUUID } from "node:crypto";
import { actionStore, getInvoiceForAction } from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import { PayPalApiError, type PayPalRestClient, type PayPalRestPath } from "@niryat/paypal";
import { financialYear, LUT_ENDORSEMENT } from "@niryat/rules";
import {
  type ClientInput,
  clientSchema,
  type Invoice,
  type InvoiceInput,
  invoiceBlockedSchema,
  invoiceSchema,
  type ProfileInput,
  profileInputSchema,
} from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { actionHandlers } from "../actions";
import { type FileStore, pdfKey } from "../files";
import { createApp } from "../index";
import * as ruleClock from "../rules";
import type { AppDeps } from "./auth";

describe.skipIf(!testDatabaseUrl)("invoice routes", () => {
  const invoiceDate = "2026-10-26";
  const recurrence = { intervalUnit: "MONTH", intervalCount: 1, totalCycles: 2 } as const;
  let t: Awaited<ReturnType<typeof openTestDb>>;
  let deps: AppDeps;
  let app: ReturnType<typeof createApp>;
  let files: FileStore;
  let objects: Map<string, Uint8Array>;
  let calls: { path: PayPalRestPath; body: unknown; requestId: string }[];
  let replies: unknown[];
  const client: ClientInput = {
    name: "Acme Inc",
    country: "US",
    email: "buyer@example.com",
    address: "1 Main Street, New York",
    answers: {
      supplierInIndia: true,
      clientPresentInIndia: false,
      paidInForeignCurrency: true,
      sameEstablishment: false,
    },
  };
  const profile: ProfileInput = {
    legalName: "Ananya Rao",
    address: "12 MG Road, Pune 411001",
    gstRegistered: true,
    gstin: "27ABCDE1234F1Z5",
    lutNumber: "LUT-1",
    lutValidFrom: "2026-04-01",
    lutValidTo: "2027-03-31",
    workType: "Software development",
    purposeCode: "P0802",
    panLast4: "234F",
    expectedTurnoverInr: 1_800_000,
  };

  beforeAll(async () => {
    t = await openTestDb();
  });
  beforeEach(async () => {
    vi.spyOn(ruleClock, "todayInIndia").mockReturnValue(invoiceDate);
    await t.reset();
    objects = new Map();
    calls = [];
    replies = [{ id: "INV2-TEST" }, undefined];
    files = {
      put: vi.fn(async (key, bytes) => {
        objects.set(key, bytes);
      }),
      get: vi.fn(async (key) => objects.get(key)),
    };
    const rest: PayPalRestClient = {
      async get() {
        throw new Error("Unexpected PayPal read");
      },
      async post(path, body, requestId, parse) {
        calls.push({ path, body, requestId });
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        return parse(reply);
      },
    };
    deps = {
      db: t.db,
      encryptionKey: randomBytes(32),
      sessionSecret: "x".repeat(32),
      secureCookies: false,
      publicAppUrl: "https://niryat.example",
      files,
      paypal: {
        rest,
        ledger: {
          async getRefund() {
            throw new Error("Unexpected refund read");
          },
          async refundCapture() {
            throw new Error("Unexpected refund request");
          },
          async getCapture() {
            throw new Error("Unexpected capture read");
          },
          async searchTransactions() {
            throw new Error("Unexpected transaction search");
          },
        },
        webhookId: "WH-TEST",
      },
    };
    app = createApp(deps);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await t?.close();
  });

  function post(cookie: string, path: string, body: unknown = {}) {
    return app.request(path, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function signup(email = "invoice-a@example.com") {
    const response = await post("", "/auth/signup", { email, password: "correct-horse-battery" });
    expect(response.status).toBe(201);
    const user = z.object({ id: z.uuid(), email: z.email() }).parse(await response.json());
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Expected a session cookie");
    return { ...user, cookie };
  }

  async function saveProfile(cookie: string, body: ProfileInput = profile) {
    const response = await app.request("/profile", {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    profileInputSchema.parse(await response.json());
  }

  async function setup(body: ClientInput = client, withProfile = true) {
    const user = await signup();
    if (withProfile) await saveProfile(user.cookie);
    const response = await post(user.cookie, "/clients", body);
    expect(response.status).toBe(201);
    const saved = clientSchema.parse(await response.json());
    const input: InvoiceInput = {
      clientId: saved.id,
      type: "one_time",
      recurrence: null,
      description: "Software development",
      sac: "998314",
      currency: "USD",
      amount: "100.00",
    };
    return { ...user, input };
  }

  async function readInvoice(response: Response, status = 200): Promise<Invoice> {
    expect(response.status).toBe(status);
    return invoiceSchema.parse(await response.json());
  }

  async function issue(cookie: string, input: InvoiceInput) {
    return readInvoice(await post(cookie, "/invoices", input), 201);
  }

  async function list(cookie: string) {
    const response = await app.request("/invoices", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return z.array(invoiceSchema).parse(await response.json());
  }

  function actionId(invoice: Invoice): string {
    if (!invoice.action) throw new Error("Expected a proposed action");
    return invoice.action.id;
  }

  function filePath(invoice: Invoice) {
    return new URL(invoice.pdfUrl).pathname.replace(/^\/api/, "");
  }

  it.each([
    ["GET", "/invoices"],
    ["POST", "/invoices"],
    ["POST", "/actions/bad/approve"],
    ["POST", "/actions/bad/reject"],
  ])("requires a session for %s %s", async (method, path) => {
    const response = await app.request(path, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("blocks an Indian recipient without storing an invoice or consuming a number", async () => {
    const { cookie, input } = await setup({ ...client, country: "IN" });
    const response = await post(cookie, "/invoices", input);
    expect(response.status).toBe(422);
    expect(invoiceBlockedSchema.parse(await response.json()).reasons).toEqual([
      "The client is in India. PayPal also blocks invoices to India-based recipients.",
      "The client is in India, so the place of supply is India.",
    ]);
    expect(await list(cookie)).toEqual([]);
    expect(objects.size).toBe(0);
    expect(calls).toEqual([]);
    const updated = await app.request(`/clients/${input.clientId}`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(client),
    });
    expect(updated.status).toBe(200);
    clientSchema.parse(await updated.json());
    expect((await issue(cookie, input)).number).toBe(`${financialYear(invoiceDate)}/0001`);
  });

  it("puts the email reason before rule reasons", async () => {
    const { cookie, input } = await setup({ ...client, country: "IN", email: null });
    const response = await post(cookie, "/invoices", input);
    expect(response.status).toBe(422);
    const blocked = invoiceBlockedSchema.parse(await response.json());
    expect(blocked.reasons[0]).toBe("Add the client's email so PayPal can send the invoice.");
    expect(blocked.reasons).toHaveLength(3);
  });

  it("puts the missing profile reason first", async () => {
    const { cookie, input } = await setup({ ...client, email: null }, false);
    const response = await post(cookie, "/invoices", input);
    expect(response.status).toBe(422);
    expect(invoiceBlockedSchema.parse(await response.json()).reasons).toEqual([
      "Complete your compliance profile before issuing invoices.",
      "Add the client's email so PayPal can send the invoice.",
    ]);
  });

  it("issues a proposed invoice without calling PayPal and serves its PDF publicly", async () => {
    const { cookie, input, id: userId } = await setup();
    const invoice = await issue(cookie, input);
    expect(invoice).toMatchObject({
      number: `${financialYear(invoiceDate)}/0001`,
      date: invoiceDate,
      status: "issued",
      action: {
        status: "proposed",
        paypalAction: "send_invoice",
        payload: {
          invoiceId: invoice.id,
          create: {
            detail: {
              invoice_number: invoice.number,
              invoice_date: invoice.date,
              note: `GST invoice PDF: ${invoice.pdfUrl}`,
              terms_and_conditions: `${LUT_ENDORSEMENT}\nLUT reference: LUT-1`,
            },
            invoicer: { business_name: profile.legalName, tax_id: profile.gstin },
          },
          send: { subject: `Invoice ${invoice.number} from ${profile.legalName}` },
        },
      },
    });
    expect(invoice.pdfUrl).toMatch(/^https:\/\/niryat.example\/api\/files\/[A-Za-z0-9_-]{43}$/);
    expect(calls).toEqual([]);
    expect(objects.size).toBe(1);
    expect(files.put).toHaveBeenCalledWith(
      pdfKey(userId, invoice.id),
      expect.any(Uint8Array),
      "application/pdf",
    );
    expect(await list(cookie)).toEqual([invoice]);
    const response = await app.request(filePath(invoice));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      `inline; filename="${invoice.number.replaceAll("/", "-")}.pdf"`,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes).toEqual(objects.get(pdfKey(userId, invoice.id)));
    expect(Buffer.from(bytes).toString("ascii", 0, 5)).toBe("%PDF-");
  });

  it("omits GST fields for an unregistered supplier", async () => {
    const { cookie, input } = await setup();
    await saveProfile(cookie, { ...profile, gstRegistered: false });
    const invoice = await issue(cookie, input);
    const create = z
      .object({
        detail: z.object({ note: z.string(), terms_and_conditions: z.string().optional() }),
        invoicer: z.object({ tax_id: z.string().optional() }),
      })
      .parse(invoice.action?.payload.create);
    expect(create.detail.note).toBe(`Invoice PDF: ${invoice.pdfUrl}`);
    expect(create.detail.terms_and_conditions).toBeUndefined();
    expect(create.invoicer.tax_id).toBeUndefined();
  });

  it("creates and sends only after approval with deterministic request IDs", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    const id = actionId(invoice);
    const sent = await readInvoice(await post(cookie, `/actions/${id}/approve`));
    expect(sent).toMatchObject({
      status: "sent",
      paypalInvoiceId: "INV2-TEST",
      action: { status: "done", error: null, payload: invoice.action?.payload },
    });
    expect(calls).toEqual([
      {
        path: "/v2/invoicing/invoices",
        body: invoice.action?.payload.create,
        requestId: `${id}-create`,
      },
      {
        path: "/v2/invoicing/invoices/INV2-TEST/send",
        body: invoice.action?.payload.send,
        requestId: `${id}-send`,
      },
    ]);
  });

  it("issues a recurring first cycle with the next number and PDF without calling PayPal", async () => {
    const { cookie, input, id: userId } = await setup();
    await issue(cookie, input);
    const invoice = await issue(cookie, { ...input, type: "recurring", recurrence });
    expect(invoice).toMatchObject({
      type: "recurring",
      recurrence,
      number: `${financialYear(invoiceDate)}/0002`,
      date: invoiceDate,
      status: "issued",
      paypalInvoiceId: null,
      paypalRecurringSeriesId: null,
      action: {
        status: "proposed",
        paypalAction: "create_recurring_series",
        payload: {
          invoiceId: invoice.id,
          create: {
            plan_detail: {
              frequency: { interval_unit: "MONTH", interval_count: 1 },
              total_cycles: 2,
              start_series_date: invoiceDate,
            },
            recurring_info: {
              detail: {
                currency_code: "USD",
                note: `GST invoice PDF: ${invoice.pdfUrl}`,
                terms_and_conditions: `${LUT_ENDORSEMENT}\nLUT reference: LUT-1`,
              },
              invoicer: { business_name: profile.legalName, tax_id: profile.gstin },
            },
          },
        },
      },
    });
    const payload = z
      .strictObject({
        invoiceId: z.uuid(),
        create: z.object({
          recurring_info: z.object({ detail: z.record(z.string(), z.unknown()) }),
        }),
      })
      .parse(invoice.action?.payload);
    expect(payload.create.recurring_info.detail).not.toHaveProperty("invoice_number");
    expect(calls).toEqual([]);
    expect(objects.size).toBe(2);
    const response = await app.request(filePath(invoice));
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      objects.get(pdfKey(userId, invoice.id)),
    );
  });

  it("creates and activates a series only after approval, accepting an empty response", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, { ...input, type: "recurring", recurrence });
    const id = actionId(invoice);
    replies = [{ id: "RI-TEST" }, undefined];
    const sent = await readInvoice(await post(cookie, `/actions/${id}/approve`));
    expect(sent).toMatchObject({
      status: "sent",
      paypalRecurringSeriesId: "RI-TEST",
      paypalInvoiceId: null,
      action: { status: "done", error: null, payload: invoice.action?.payload },
    });
    expect(calls).toEqual([
      {
        path: "/v2/invoicing/recurring-invoices",
        body: invoice.action?.payload.create,
        requestId: `${id}-create`,
      },
      {
        path: "/v2/invoicing/recurring-invoices/RI-TEST/activate",
        body: undefined,
        requestId: `${id}-activate`,
      },
    ]);
    expect((await post(cookie, `/actions/${id}/approve`)).status).toBe(409);
    expect(calls).toHaveLength(2);
  });

  it("retains the created series ID after failure and retries only activate", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, { ...input, type: "recurring", recurrence });
    const id = actionId(invoice);
    const path = `/actions/${id}/approve`;
    replies = [{ id: "RI-TEST" }, new PayPalApiError(500, "INTERNAL_SERVER_ERROR"), undefined];
    const response = await post(cookie, path);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "paypal_failed",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect((await list(cookie))[0]).toMatchObject({
      status: "issued",
      paypalRecurringSeriesId: "RI-TEST",
      paypalInvoiceId: null,
      action: { status: "failed", error: "INTERNAL_SERVER_ERROR" },
    });
    expect(await readInvoice(await post(cookie, path))).toMatchObject({
      status: "sent",
      action: { status: "done", error: null },
    });
    expect(calls.map(({ path, requestId }) => ({ path, requestId }))).toEqual([
      { path: "/v2/invoicing/recurring-invoices", requestId: `${id}-create` },
      { path: "/v2/invoicing/recurring-invoices/RI-TEST/activate", requestId: `${id}-activate` },
      { path: "/v2/invoicing/recurring-invoices/RI-TEST/activate", requestId: `${id}-activate` },
    ]);
  });

  it("accepts the created invoice ID from href and an empty send response", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    replies = [
      { href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-LINK" },
      undefined,
    ];
    const sent = await readInvoice(await post(cookie, `/actions/${actionId(invoice)}/approve`));
    expect(sent.paypalInvoiceId).toBe("INV2-LINK");
    expect(calls[1]?.path).toBe("/v2/invoicing/invoices/INV2-LINK/send");
  });

  it("retains the created ID after failure and retries only send", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    const path = `/actions/${actionId(invoice)}/approve`;
    replies = [{ id: "INV2-TEST" }, new PayPalApiError(500, "INTERNAL_SERVER_ERROR"), undefined];
    const response = await post(cookie, path);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "paypal_failed",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect((await list(cookie))[0]).toMatchObject({
      status: "issued",
      paypalInvoiceId: "INV2-TEST",
      action: { status: "failed", error: "INTERNAL_SERVER_ERROR" },
    });
    expect(await readInvoice(await post(cookie, path))).toMatchObject({
      status: "sent",
      action: { status: "done", error: null },
    });
    expect(calls.map((call) => call.requestId)).toEqual([
      `${actionId(invoice)}-create`,
      `${actionId(invoice)}-send`,
      `${actionId(invoice)}-send`,
    ]);
  });

  it("returns conflicts for repeated approval and rejection after sending", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    const path = `/actions/${actionId(invoice)}`;
    await readInvoice(await post(cookie, `${path}/approve`));
    for (const operation of ["approve", "reject"]) {
      const response = await post(cookie, `${path}/${operation}`);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "action_not_pending" });
    }
    expect(calls).toHaveLength(2);
  });

  it("makes rejection final and keeps the issued number", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    const path = `/actions/${actionId(invoice)}`;
    expect(await readInvoice(await post(cookie, `${path}/reject`))).toMatchObject({
      number: invoice.number,
      status: "issued",
      action: { status: "rejected" },
    });
    for (const operation of ["approve", "reject"]) {
      expect((await post(cookie, `${path}/${operation}`)).status).toBe(409);
    }
    expect(calls).toEqual([]);
    expect((await issue(cookie, input)).number).toBe(`${financialYear(invoiceDate)}/0002`);
  });

  it("hides another user's invoices, clients and actions", async () => {
    const a = await setup();
    const invoice = await issue(a.cookie, a.input);
    const b = await signup("invoice-b@example.com");
    expect(await list(b.cookie)).toEqual([]);
    for (const operation of ["approve", "reject"]) {
      const response = await post(b.cookie, `/actions/${actionId(invoice)}/${operation}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    expect((await post(b.cookie, "/invoices", a.input)).status).toBe(404);
    expect((await list(a.cookie))[0]?.action?.status).toBe("proposed");
    expect(calls).toEqual([]);
  });

  it("leaves approval unclaimed when PayPal is absent but allows rejection", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    delete deps.paypal;
    const response = await post(cookie, `/actions/${actionId(invoice)}/approve`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "paypal_unavailable" });
    expect((await list(cookie))[0]?.action?.status).toBe("proposed");
    await readInvoice(await post(cookie, `/actions/${actionId(invoice)}/reject`));
    expect(calls).toEqual([]);
  });

  it.each(["bad", "a".repeat(43)])("rejects an invalid or unknown PDF token: %s", async (token) => {
    const response = await app.request(`/files/${token}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(files.get).not.toHaveBeenCalled();
  });

  it("handles missing objects and unavailable storage without exposing storage errors", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    objects.clear();
    expect((await app.request(filePath(invoice))).status).toBe(404);
    vi.mocked(files.get).mockRejectedValueOnce(new Error("private storage detail"));
    const response = await app.request(filePath(invoice));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "file_storage_unavailable" });
    delete deps.files;
    expect((await app.request(filePath(invoice))).status).toBe(503);
    expect((await post(cookie, "/invoices", input)).status).toBe(503);
    expect(await list(cookie)).toHaveLength(1);
  });

  it("rolls back a failed upload without consuming a number", async () => {
    const { cookie, input } = await setup();
    vi.mocked(files.put).mockRejectedValueOnce(new Error("private storage detail"));
    const response = await post(cookie, "/invoices", input);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "file_storage_unavailable" });
    expect(await list(cookie)).toEqual([]);
    expect((await issue(cookie, input)).number).toBe(`${financialYear(invoiceDate)}/0001`);
  });

  it("validates issue bodies and requires recurrence for recurring invoices", async () => {
    const { cookie, input } = await setup();
    const recurring = await post(cookie, "/invoices", {
      ...input,
      type: "recurring",
      recurrence: null,
    });
    expect(recurring.status).toBe(400);
    expect(await recurring.json()).toEqual({ error: "invalid_request", fields: ["recurrence"] });
    const invalid = await post(cookie, "/invoices", { ...input, amount: 100 });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid_request", fields: ["amount"] });
    expect(await list(cookie)).toEqual([]);
  });

  it("requires JSON and an empty action body before claiming", async () => {
    const { cookie, input } = await setup();
    const invoice = await issue(cookie, input);
    for (const path of [
      "/invoices",
      `/actions/${actionId(invoice)}/approve`,
      `/actions/${actionId(invoice)}/reject`,
    ]) {
      const response = await app.request(path, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "text/plain" },
        body: "{}",
      });
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    }
    for (const operation of ["approve", "reject"]) {
      const path = `/actions/${actionId(invoice)}/${operation}`;
      expect((await post(cookie, path, { approve: true })).status).toBe(400);
      const malformed = await app.request(path, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: "{",
      });
      expect(malformed.status).toBe(400);
    }
    expect((await list(cookie))[0]?.action?.status).toBe("proposed");
    expect(calls).toEqual([]);
  });

  it.each(["approve", "reject"])(
    "returns 404 for invalid and unknown IDs on %s",
    async (operation) => {
      const { cookie } = await signup();
      for (const id of ["bad", randomUUID()]) {
        const response = await post(cookie, `/actions/${id}/${operation}`);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "not_found" });
      }
    },
  );

  it("does not execute an action already claimed by another request", async () => {
    const { cookie, input, id: userId } = await setup();
    const invoice = await issue(cookie, input);
    expect(await actionStore(t.db).claim(actionId(invoice), userId)).toBeDefined();
    expect((await post(cookie, `/actions/${actionId(invoice)}/approve`)).status).toBe(409);
    expect(calls).toEqual([]);
  });

  it.each(["one_time", "recurring"] as const)(
    "rejects malformed or mismatched %s payloads before any PayPal call",
    async (type) => {
      const { cookie, input, id: userId } = await setup();
      const invoice = await issue(cookie, {
        ...input,
        type,
        recurrence: type === "recurring" ? recurrence : null,
      });
      const action = invoice.action;
      if (!action) throw new Error("Expected a proposed action");
      for (const payload of [
        { invoiceId: invoice.id, create: {}, send: {} },
        { ...action.payload, invoiceId: randomUUID() },
      ]) {
        await expect(
          actionHandlers(deps)[action.paypalAction]({ ...action, userId, payload }),
        ).rejects.toMatchObject({ code: "invalid_payload" });
      }
      expect(calls).toEqual([]);
      expect((await getInvoiceForAction(t.db, userId, action.id))?.status).toBe("issued");
    },
  );
});
