import { randomBytes, randomUUID } from "node:crypto";
import {
  actionStore,
  getInvoiceForAction,
  listReminderActions,
  listTasks,
  payments,
  recordPayment,
  recordRefund,
  reminderKeys,
} from "@niryat/db";
import { openTestDb, testDatabaseUrl } from "@niryat/db/testing";
import {
  createPayPalRestClient,
  PayPalApiError,
  type PayPalLedger,
  type PayPalRestClient,
  type PayPalRestPath,
  type RefundRecord,
} from "@niryat/paypal";
import { financialYear, LUT_ENDORSEMENT, realisationDeadline } from "@niryat/rules";
import {
  type ClientInput,
  clientSchema,
  type Invoice,
  type InvoiceInput,
  type InvoiceView,
  invoiceBlockedSchema,
  invoiceViewSchema,
  type ProfileInput,
  profileInputSchema,
} from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { actionHandlers } from "../actions";
import { toInvoiceView } from "../compliance";
import { ensureDeadlineTasks } from "../deadlines";
import { createS3FileStore, type FileStore, pdfKey } from "../files";
import { createApp } from "../index";
import { buildReminderPayload, proposeReminders, reminderCandidates } from "../reminders";
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
  let calls: {
    path: PayPalRestPath;
    body: unknown;
    requestId: string;
    options?: { retry: false };
  }[];
  let replies: unknown[];
  const refund: RefundRecord = {
    refundId: "REFUND-TEST",
    status: "COMPLETED",
    captureId: "CAPTURE-TEST",
    paypalInvoiceId: "INV2-TEST",
    gross: "40.00",
    fee: "1.00",
    net: "39.00",
    currency: "USD",
    createTime: "2026-10-27T12:00:00Z",
  };
  const refundCapture = vi.fn<PayPalLedger["refundCapture"]>();
  const getRefund = vi.fn<PayPalLedger["getRefund"]>();
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
    refundCapture.mockReset().mockResolvedValue({ refundId: refund.refundId, status: "COMPLETED" });
    getRefund.mockReset().mockResolvedValue(refund);
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
      async post(path, body, requestId, parse, options) {
        calls.push({ path, body, requestId, ...(options ? { options } : {}) });
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
          getRefund,
          refundCapture,
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

  async function readInvoice(response: Response, status = 200): Promise<InvoiceView> {
    expect(response.status).toBe(status);
    return invoiceViewSchema.parse(await response.json());
  }

  async function issue(cookie: string, input: InvoiceInput) {
    return readInvoice(await post(cookie, "/invoices", input), 201);
  }

  async function list(cookie: string) {
    const response = await app.request("/invoices", { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    return z.array(invoiceViewSchema).parse(await response.json());
  }

  function actionId(invoice: Invoice): string {
    if (!invoice.action) throw new Error("Expected a proposed action");
    return invoice.action.id;
  }

  async function proposedReminder() {
    const user = await setup();
    const issued = await issue(user.cookie, user.input);
    const invoice = toInvoiceView(
      await readInvoice(await post(user.cookie, `/actions/${actionId(issued)}/approve`)),
      true,
      "2027-06-01",
    );
    const candidate = reminderCandidates([invoice], new Set())[0];
    if (!candidate) throw new Error("Expected due reminder candidate");
    const advice = {
      advice: "hold" as const,
      reason: "The client has an open dispute on this invoice.",
    };
    const drafts = new Map([[`reminder:${invoice.id}:60`, advice]]);
    const proposed = await proposeReminders(deps, user.id, [candidate], drafts);
    const action = (await listReminderActions(t.db, user.id, 10))[0];
    if (!action) throw new Error("Expected reminder proposal");
    expect(proposed.proposed).toEqual([
      { actionId: action.id, invoiceNumber: invoice.number, stage: 60, advice },
    ]);
    expect(action.payload).toEqual(buildReminderPayload(candidate, advice));
    calls.length = 0;
    replies = [];
    return { ...user, invoice, candidate, action, drafts };
  }

  it("approves one concurrent reminder, sends only the standard flags and preserves the send action", async () => {
    const { cookie, id, invoice, action } = await proposedReminder();
    const responses = await Promise.all([
      post(cookie, `/actions/${action.id}/approve`),
      post(cookie, `/actions/${action.id}/approve`),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(calls).toEqual([
      {
        path: "/v2/invoicing/invoices/INV2-TEST/remind",
        body: { send_to_invoicer: false, send_to_recipient: true },
        requestId: `${action.id}-remind`,
        options: { retry: false },
      },
    ]);
    expect((await listReminderActions(t.db, id, 10))[0]).toMatchObject({
      status: "done",
      error: null,
      payload: action.payload,
    });
    expect((await list(cookie))[0]?.action).toEqual(invoice.action);
  });

  it("keeps the no-advice payload fixed and deduplicates real proposals", async () => {
    const { id, candidate, cookie } = await proposedReminder();
    const next = { ...candidate, stage: 30 as const };
    const result = await proposeReminders(deps, id, [next], new Map());
    expect(result.proposed).toHaveLength(1);
    expect(
      (await listReminderActions(t.db, id, 10)).find(
        (row) => row.id === result.proposed[0]?.actionId,
      )?.payload,
    ).toEqual(buildReminderPayload(next, null));
    expect(await proposeReminders(deps, id, [next], new Map())).toEqual({
      proposed: [],
      existing: 1,
    });
    expect(calls).toEqual([]);
    expect((await list(cookie))[0]?.action?.status).toBe("done");
  });

  it("rejects extra text, flags and mismatched IDs before sending a reminder", async () => {
    const { id: userId, candidate, action } = await proposedReminder();
    const valid = buildReminderPayload(candidate, null);
    const remind = { send_to_invoicer: false, send_to_recipient: true };
    for (const payload of [
      { ...valid, subject: "Custom" },
      { ...valid, note: "Custom" },
      { ...valid, extra: true },
      { ...valid, remind: { ...remind, subject: "Custom" } },
      { ...valid, remind: { ...remind, note: "Custom" } },
      { ...valid, remind: { ...remind, send_to_invoicer: true } },
      { ...valid, remind: { ...remind, send_to_recipient: false } },
      { ...valid, stage: 45 },
      { ...valid, invoiceId: randomUUID() },
      { ...valid, paypalInvoiceId: "INV2-OTHER" },
      { ...valid, agent: { advice: "send", reason: "A reason", extra: true } },
    ]) {
      await expect(
        actionHandlers(deps).send_invoice_reminder({ ...action, userId, payload }),
      ).rejects.toMatchObject({ code: "invalid_payload" });
    }
    expect(calls).toEqual([]);
  });

  it.each([
    {
      error: new PayPalApiError(422, "UNPROCESSABLE_ENTITY"),
      code: "UNPROCESSABLE_ENTITY",
      reject: 200,
    },
    {
      error: new PayPalApiError(503, "SERVICE_UNAVAILABLE"),
      code: "reminder_outcome_unknown",
      reject: 409,
    },
    {
      error: new PayPalApiError(200, "INVALID_RESPONSE"),
      code: "reminder_outcome_unknown",
      reject: 409,
    },
    {
      error: new PayPalApiError(422, "INVALID_RESPONSE"),
      code: "reminder_outcome_unknown",
      reject: 409,
    },
    {
      error: new PayPalApiError(422, "private detail@example.com"),
      code: "reminder_outcome_unknown",
      reject: 409,
    },
    { error: new Error("private transport detail"), code: "reminder_outcome_unknown", reject: 409 },
  ])(
    "never retries a failed reminder; rejection status $reject for $code",
    async ({ error, code, reject }) => {
      const { cookie, id, action } = await proposedReminder();
      replies = [error];
      const response = await post(cookie, `/actions/${action.id}/approve`);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "paypal_failed", code });
      expect((await listReminderActions(t.db, id, 10))[0]).toMatchObject({
        status: "failed",
        error: code,
      });
      expect((await post(cookie, `/actions/${action.id}/approve`)).status).toBe(409);
      expect((await post(cookie, `/actions/${action.id}/reject`)).status).toBe(reject);
      expect(calls).toHaveLength(1);
    },
  );

  it("does not remind an invoice paid after proposal and allows rejecting it", async () => {
    const { cookie, id, action } = await proposedReminder();
    await recordPayment(t.db, {
      captureId: "CAPTURE-TEST",
      status: "COMPLETED",
      paypalInvoiceId: "INV2-TEST",
      gross: "100.00",
      fee: null,
      net: null,
      currency: "USD",
      fxRate: null,
      createTime: "2026-10-27T12:00:00Z",
    });
    const response = await post(cookie, `/actions/${action.id}/approve`);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "paypal_failed", code: "reminder_not_needed" });
    expect((await post(cookie, `/actions/${action.id}/approve`)).status).toBe(409);
    expect((await post(cookie, `/actions/${action.id}/reject`)).status).toBe(200);
    expect((await listReminderActions(t.db, id, 10))[0]?.status).toBe("rejected");
    expect(calls).toEqual([]);
  });

  it("isolates reminder approvals and leaves a proposal unclaimed without PayPal", async () => {
    const { cookie, id, action } = await proposedReminder();
    const other = await signup("other@example.com");
    for (const operation of ["approve", "reject"]) {
      expect((await post(other.cookie, `/actions/${action.id}/${operation}`)).status).toBe(404);
    }
    delete deps.paypal;
    app = createApp(deps);
    expect((await post(cookie, `/actions/${action.id}/approve`)).status).toBe(503);
    expect((await listReminderActions(t.db, id, 10))[0]?.status).toBe("proposed");
    expect(calls).toEqual([]);
  });

  it.each([
    { body: "not JSON", code: "reminder_outcome_unknown", rejectStatus: 409 },
    { body: '{"name":42}', code: "reminder_outcome_unknown", rejectStatus: 409 },
    {
      body: '{"message":"unrecognised error"}',
      code: "reminder_outcome_unknown",
      rejectStatus: 409,
    },
    { body: '{"name":"UNPROCESSABLE_ENTITY"}', code: "UNPROCESSABLE_ENTITY", rejectStatus: 200 },
  ])(
    "keeps unvalidated PayPal error bodies unknown: $body",
    async ({ body, code, rejectStatus }) => {
      const { cookie, id, action } = await proposedReminder();
      const fetcher = vi.fn<typeof fetch>(async (url) =>
        String(url).endsWith("/v1/oauth2/token")
          ? Response.json({ access_token: "test-token", expires_in: 3600 })
          : new Response(body, { status: 422 }),
      );
      if (!deps.paypal) throw new Error("Expected PayPal fake");
      deps.paypal.rest = createPayPalRestClient({
        clientId: "test",
        clientSecret: "test",
        fetch: fetcher,
      });
      const response = await post(cookie, `/actions/${action.id}/approve`);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "paypal_failed", code });
      expect((await listReminderActions(t.db, id, 10))[0]).toMatchObject({
        status: "failed",
        error: code,
      });
      expect((await post(cookie, `/actions/${action.id}/approve`)).status).toBe(409);
      expect((await post(cookie, `/actions/${action.id}/reject`)).status).toBe(rejectStatus);
      expect((await listReminderActions(t.db, id, 10))[0]?.status).toBe(
        rejectStatus === 409 ? "failed" : "rejected",
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]?.[1]?.method).toBe("POST");
    },
  );

  it.each(["network", "read"])(
    "blocks resend/replacement after remote acceptance and a lost %s response, including restart",
    async (failure) => {
      const { cookie, id, invoice, candidate, action, drafts } = await proposedReminder();
      const fetcher = vi.fn<typeof fetch>(async (url) => {
        if (String(url).endsWith("/v1/oauth2/token"))
          return Response.json({ access_token: "test-token", expires_in: 3600 });
        if (failure === "network") throw new Error("lost response after acceptance");
        const response = new Response(null, { status: 204 });
        vi.spyOn(response, "text").mockRejectedValue(
          new Error("lost response body after acceptance"),
        );
        return response;
      });
      const paypal = deps.paypal;
      if (!paypal) throw new Error("Expected PayPal fake");
      const restart = () => {
        paypal.rest = createPayPalRestClient({
          clientId: "test",
          clientSecret: "test",
          fetch: fetcher,
        });
        app = createApp(deps);
      };
      restart();
      const response = await post(cookie, `/actions/${action.id}/approve`);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "paypal_failed",
        code: "reminder_outcome_unknown",
      });
      expect((await listReminderActions(t.db, id, 10))[0]).toMatchObject({
        status: "failed",
        error: "reminder_outcome_unknown",
      });
      restart();
      for (const operation of ["approve", "reject"]) {
        expect((await post(cookie, `/actions/${action.id}/${operation}`)).status).toBe(409);
      }
      const keys = await reminderKeys(t.db, id);
      expect(reminderCandidates([invoice], keys)).toEqual([]);
      expect(await proposeReminders(deps, id, [candidate], drafts)).toEqual({
        proposed: [],
        existing: 1,
      });
      expect(await listReminderActions(t.db, id, 10)).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "POST", redirect: "error" });
    },
  );

  it.each(["approved", "done", "failed"])(
    "keeps crash safety when persisting %s fails",
    async (failureStatus) => {
      const { cookie, id, candidate, action, drafts } = await proposedReminder();
      await t.db.execute(`CREATE FUNCTION niryat_test_reminder_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.paypal_action = 'send_invoice_reminder' AND NEW.status = TG_ARGV[0] THEN
        RAISE EXCEPTION 'synthetic status write failure'; END IF; RETURN NEW; END $$`);
      try {
        await t.db.execute(`CREATE TRIGGER niryat_test_reminder_fail BEFORE UPDATE ON agent_actions
        FOR EACH ROW EXECUTE FUNCTION niryat_test_reminder_fail('${failureStatus}')`);
        if (failureStatus === "failed") replies = [new Error("lost accepted response")];
        const response = await post(cookie, `/actions/${action.id}/approve`);
        expect(response.status).toBe(500);
        expect(calls).toHaveLength(failureStatus === "approved" ? 0 : 1);
        expect((await listReminderActions(t.db, id, 10))[0]?.status).toBe(
          failureStatus === "approved" ? "proposed" : "approved",
        );
      } finally {
        await t.db.execute("DROP TRIGGER IF EXISTS niryat_test_reminder_fail ON agent_actions");
        await t.db.execute("DROP FUNCTION niryat_test_reminder_fail()");
      }
      app = createApp(deps);
      if (failureStatus !== "approved") {
        for (const operation of ["approve", "reject"]) {
          expect((await post(cookie, `/actions/${action.id}/${operation}`)).status).toBe(409);
        }
      }
      expect(await proposeReminders(deps, id, [candidate], drafts)).toEqual({
        proposed: [],
        existing: 1,
      });
      expect(calls).toHaveLength(failureStatus === "approved" ? 0 : 1);
    },
  );

  it("leaves an interrupted claim blocked across application restart without dispatch", async () => {
    const { cookie, id, action } = await proposedReminder();
    expect(await actionStore(t.db).claim(action.id, id)).toBeDefined();
    app = createApp(deps);
    for (const operation of ["approve", "reject"]) {
      expect((await post(cookie, `/actions/${action.id}/${operation}`)).status).toBe(409);
    }
    expect(calls).toEqual([]);
    expect((await listReminderActions(t.db, id, 10))[0]?.status).toBe("approved");
  });

  function filePath(invoice: Invoice) {
    if (invoice.pdfUrl === null) throw new Error("Expected an invoice PDF");
    return new URL(invoice.pdfUrl).pathname.replace(/^\/api/, "");
  }

  async function paidInvoice() {
    const user = await setup();
    const issued = await issue(user.cookie, user.input);
    await readInvoice(await post(user.cookie, `/actions/${actionId(issued)}/approve`));
    await recordPayment(t.db, {
      captureId: "CAPTURE-TEST",
      status: "COMPLETED",
      paypalInvoiceId: "INV2-TEST",
      gross: "100.00",
      fee: "4.40",
      net: "95.60",
      currency: "USD",
      fxRate: null,
      createTime: "2026-10-26T12:00:00Z",
    });
    const [invoice] = await list(user.cookie);
    const payment = invoice?.payments[0];
    if (!invoice || !payment) throw new Error("Expected a paid invoice");
    return { ...user, invoice, payment, path: `/payments/${payment.id}/refunds` };
  }

  function refundAction(invoice: Invoice) {
    const action = invoice.refundActions[0];
    if (!action) throw new Error("Expected a refund action");
    return action;
  }

  it("returns rules deadlines and ensures overdue tasks once, scoped to the user", async () => {
    const { id: userId, cookie, input } = await setup();
    const other = await signup("other@example.com");
    const issued = await issue(cookie, input);
    expect(issued.compliance.deadline).toEqual(
      realisationDeadline({ invoice: issued, today: invoiceDate }, ruleClock.rules),
    );
    const sent = await readInvoice(await post(cookie, `/actions/${actionId(issued)}/approve`));
    expect(sent.status).toBe("sent");
    expect(sent.compliance.deadline).toEqual(issued.compliance.deadline);
    expect(await ensureDeadlineTasks(t.db, userId, [sent])).toEqual({ overdue: 0, created: 0 });
    expect(await ensureDeadlineTasks(t.db, userId, [])).toEqual({ overdue: 0, created: 0 });

    const today = "2027-07-27";
    vi.mocked(ruleClock.todayInIndia).mockReturnValue(today);
    const views = await list(cookie);
    const deadline = realisationDeadline({ invoice: sent, today }, ruleClock.rules);
    expect(views[0]?.compliance.deadline).toEqual(deadline);
    expect(deadline.overdue).toBe(true);
    expect(await listTasks(t.db, userId)).toEqual([]);
    expect(await list(other.cookie)).toEqual([]);
    expect(await ensureDeadlineTasks(t.db, userId, views)).toEqual({ overdue: 1, created: 1 });
    expect(await ensureDeadlineTasks(t.db, userId, views)).toEqual({ overdue: 1, created: 0 });
    expect(await listTasks(t.db, userId)).toEqual([
      expect.objectContaining({
        invoiceId: sent.id,
        type: "rbi_deadline_passed",
        status: "open",
        dueDate: deadline.deadline,
        message:
          `The RBI deadline to receive payment for invoice ${sent.number} was 2027-07-26. ` +
          "Ask your bank (AD bank) whether it can extend the deadline.",
        sourceRuleId: "RBI_REALISATION",
      }),
    ]);
    expect(await listTasks(t.db, other.id)).toEqual([]);
  });

  it("removes a paid invoice's deadline and restores it after a refund shortfall", async () => {
    const { id: userId, cookie, invoice } = await paidInvoice();
    expect(invoice.compliance.deadline).toBeNull();
    expect(await ensureDeadlineTasks(t.db, userId, [invoice])).toEqual({ overdue: 0, created: 0 });
    await recordRefund(t.db, refund);
    const [refunded] = await list(cookie);
    expect(refunded?.status).toBe("partially_refunded");
    expect(refunded?.compliance.deadline).toEqual(
      realisationDeadline({ invoice, today: invoiceDate }, ruleClock.rules),
    );
  });

  it.each([
    ["GET", "/invoices"],
    ["POST", "/invoices"],
    ["POST", "/actions/bad/approve"],
    ["POST", "/actions/bad/reject"],
    ["POST", "/payments/bad/refunds"],
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

  it("releases the numbering lock for another user after a stalled upload times out", async () => {
    const a = await setup();
    const b = await signup("invoice-b@example.com");
    await saveProfile(b.cookie);
    const clientResponse = await post(b.cookie, "/clients", client);
    expect(clientResponse.status).toBe(201);
    const input = { ...a.input, clientId: clientSchema.parse(await clientResponse.json()).id };
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
    const started = Promise.withResolvers<AbortSignal>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (request) => {
        if (!(request instanceof Request)) throw new Error("Expected signed request");
        const { signal } = request;
        started.resolve(signal);
        signal.throwIfAborted();
        return new Promise<Response>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      })
      .mockImplementation(async () => new Response(null, { status: 200 }));
    deps.files = createS3FileStore(
      {
        FILE_STORAGE_URL: "https://storage.example/bucket",
        FILE_STORAGE_ACCESS_KEY_ID: "test-access-key",
        FILE_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
        FILE_STORAGE_REGION: "auto",
      },
      fetcher,
    );
    const stalled = post(a.cookie, "/invoices", a.input);
    let waiting: Promise<Response> | undefined;
    try {
      const signal = await started.promise;
      waiting = Promise.resolve(post(b.cookie, "/invoices", input));
      await vi.waitFor(async () => {
        const waiters = await t.db.execute(`select 1 from pg_locks
          where locktype = 'advisory' and not granted
          and database = (select oid from pg_database where datname = current_database())`);
        expect(waiters.rowCount).toBeGreaterThan(0);
      });
      expect(signal.aborted).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      deadline.abort(new DOMException("private storage detail", "TimeoutError"));
      await Promise.all([stalled, waiting]);
    }
    const response = await stalled;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "file_storage_unavailable" });
    if (!waiting) throw new Error("Expected a waiting invoice request");
    expect(await readInvoice(await waiting, 201)).toMatchObject({
      number: `${financialYear(invoiceDate)}/0001`,
      action: { status: "proposed" },
    });
    expect(await list(a.cookie)).toEqual([]);
    expect(await list(b.cookie)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([]);
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

  it("proposes the exact refund payload without PayPal and blocks another open proposal", async () => {
    const { cookie, path, invoice, payment } = await paidInvoice();
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    expect(proposed.action).toEqual(invoice.action);
    expect(refundAction(proposed)).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
      error: null,
      paypalAction: "refund_payment",
      status: "proposed",
      paymentId: payment.id,
      payload: {
        invoiceId: invoice.id,
        paymentId: payment.id,
        captureId: payment.paypalTxnId,
        refund: {
          amount: { currency_code: "USD", value: "40" },
          note_to_payer: `Refund for invoice ${invoice.number}`,
        },
      },
    });
    const duplicate = await post(cookie, path, { amount: "40" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "refund_pending" });
    expect(refundCapture).not.toHaveBeenCalled();
    expect(getRefund).not.toHaveBeenCalled();
  });

  it("limits refunds to the remaining capture balance using exact amounts", async () => {
    const { cookie, path } = await paidInvoice();
    const excessive = await post(cookie, path, { amount: "100.01" });
    expect(excessive.status).toBe(422);
    expect(await excessive.json()).toEqual({ error: "refund_exceeds_payment" });
    await recordRefund(t.db, { ...refund, gross: "60.00" });
    const remaining = await post(cookie, path, { amount: "50" });
    expect(remaining.status).toBe(422);
    expect(await remaining.json()).toEqual({ error: "refund_exceeds_payment" });
    await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("hides foreign, unknown, unlinked and non-payment rows", async () => {
    const { cookie, path, invoice } = await paidInvoice();
    const other = await signup("other@example.com");
    expect((await post(other.cookie, path, { amount: "40" })).status).toBe(404);
    await recordPayment(t.db, {
      captureId: "UNLINKED",
      status: "COMPLETED",
      paypalInvoiceId: null,
      gross: "100",
      fee: null,
      net: null,
      currency: "USD",
      fxRate: null,
      createTime: "2026-10-26T12:00:00Z",
    });
    const rows = await t.db.select().from(payments);
    const unlinked = rows.find((row) => row.invoiceId === null);
    if (!unlinked) throw new Error("Expected an unlinked payment");
    await recordRefund(t.db, refund);
    const saved = (await list(cookie))[0]?.refunds[0];
    if (!saved) throw new Error("Expected a refund");
    for (const id of ["bad", randomUUID(), unlinked.id, saved.id]) {
      const response = await post(cookie, `/payments/${id}/refunds`, { amount: "1" });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    for (const operation of ["approve", "reject"]) {
      expect(
        (await post(other.cookie, `/actions/${refundAction(proposed).id}/${operation}`)).status,
      ).toBe(404);
    }
    expect(proposed.action).toEqual(invoice.action);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("records a completed approved refund once, retaining the send action and deduplicating the task", async () => {
    const { cookie, path, invoice, payment } = await paidInvoice();
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    const action = refundAction(proposed);
    const approve = `/actions/${action.id}/approve`;
    const result = await readInvoice(await post(cookie, approve));
    expect(refundCapture).toHaveBeenCalledExactlyOnceWith(
      {
        captureId: payment.paypalTxnId,
        amount: { value: "40", currency: "USD" },
        noteToPayer: `Refund for invoice ${invoice.number}`,
      },
      `${action.id}-refund`,
    );
    expect(getRefund).toHaveBeenCalledExactlyOnceWith(refund.refundId);
    expect(result.status).toBe("partially_refunded");
    expect(result.refunds).toHaveLength(1);
    expect(result.refunds[0]).toMatchObject({
      paypalTxnId: refund.refundId,
      gross: "40.00",
      fee: "1.00",
      net: "39.00",
    });
    expect(refundAction(result)).toMatchObject({ status: "done", payload: action.payload });
    expect(result.action).toEqual(invoice.action);
    const tasks = await app.request("/tasks", { headers: { Cookie: cookie } });
    expect(await tasks.json()).toEqual([
      expect.objectContaining({ type: "refund_recorded", invoiceId: invoice.id }),
    ]);
    expect((await post(cookie, approve)).status).toBe(409);
    expect(refundCapture).toHaveBeenCalledTimes(1);
  });

  it("retains a failed refund and reuses its request ID on approval retry", async () => {
    const { cookie, path } = await paidInvoice();
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    const action = refundAction(proposed);
    refundCapture.mockRejectedValueOnce(new PayPalApiError(422, "REFUND_AMOUNT_EXCEEDED"));
    const response = await post(cookie, `/actions/${action.id}/approve`);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "paypal_failed",
      code: "REFUND_AMOUNT_EXCEEDED",
    });
    const [failed] = await list(cookie);
    expect(failed?.refundActions[0]).toMatchObject({
      status: "failed",
      error: "REFUND_AMOUNT_EXCEEDED",
    });
    expect((await post(cookie, path, { amount: "1" })).status).toBe(409);
    expect(getRefund).not.toHaveBeenCalled();
    const retried = await readInvoice(await post(cookie, `/actions/${action.id}/approve`));
    expect(refundAction(retried)).toMatchObject({
      status: "done",
      error: null,
      payload: action.payload,
    });
    expect(refundCapture.mock.calls.map((call) => call[1])).toEqual([
      `${action.id}-refund`,
      `${action.id}-refund`,
    ]);
  });

  it.each(["not_found", "not_completed"] as const)(
    "keeps an unrecorded completed refund retryable when the read is %s",
    async (outcome) => {
      const { cookie, path, invoice } = await paidInvoice();
      const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
      const action = refundAction(proposed);
      const approve = `/actions/${action.id}/approve`;
      getRefund.mockResolvedValueOnce(
        outcome === "not_found" ? null : { ...refund, status: "PENDING" },
      );
      const response = await post(cookie, approve);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "paypal_failed",
        code: "refund_not_recorded",
      });
      const [failed] = await list(cookie);
      expect(failed).toMatchObject({ status: "paid", refunds: [], action: invoice.action });
      expect(failed?.refundActions[0]).toMatchObject({
        status: "failed",
        error: "refund_not_recorded",
        payload: action.payload,
      });
      expect(getRefund).toHaveBeenCalledExactlyOnceWith(refund.refundId);
      expect((await post(cookie, path, { amount: "40" })).status).toBe(409);
      const tasksBeforeRetry = await app.request("/tasks", { headers: { Cookie: cookie } });
      expect(await tasksBeforeRetry.json()).toEqual([]);

      const retried = await readInvoice(await post(cookie, approve));
      expect(refundAction(retried)).toMatchObject({
        status: "done",
        error: null,
        payload: action.payload,
      });
      expect(retried.status).toBe("partially_refunded");
      expect(retried.refunds).toHaveLength(1);
      expect(retried.action).toEqual(invoice.action);
      expect(refundCapture.mock.calls.map((call) => call[1])).toEqual([
        `${action.id}-refund`,
        `${action.id}-refund`,
      ]);
      const tasksAfterRetry = await app.request("/tasks", { headers: { Cookie: cookie } });
      expect(await tasksAfterRetry.json()).toEqual([
        expect.objectContaining({ type: "refund_recorded", invoiceId: invoice.id }),
      ]);
    },
  );

  it("finishes a pending refund without recording money or reading the refund", async () => {
    const { cookie, path } = await paidInvoice();
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    refundCapture.mockResolvedValueOnce({ refundId: refund.refundId, status: "PENDING" });
    const result = await readInvoice(
      await post(cookie, `/actions/${refundAction(proposed).id}/approve`),
    );
    expect(refundAction(result).status).toBe("done");
    expect(result.refunds).toEqual([]);
    expect(result.status).toBe("paid");
    expect(getRefund).not.toHaveBeenCalled();
  });

  it("allows a new proposal after rejection and lists refund actions newest first", async () => {
    const { cookie, path } = await paidInvoice();
    const first = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    const action = refundAction(first);
    await readInvoice(await post(cookie, `/actions/${action.id}/reject`));
    expect((await post(cookie, `/actions/${action.id}/approve`)).status).toBe(409);
    const second = await readInvoice(await post(cookie, path, { amount: "20" }), 201);
    expect(second.refundActions).toHaveLength(2);
    expect(second.refundActions.map((a) => a.status)).toEqual(["proposed", "rejected"]);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("proposes without PayPal and leaves the refund unclaimed on unavailable approval", async () => {
    const { cookie, path } = await paidInvoice();
    delete deps.paypal;
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    const id = refundAction(proposed).id;
    const response = await post(cookie, `/actions/${id}/approve`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "paypal_unavailable" });
    expect((await list(cookie))[0]?.refundActions[0]?.status).toBe("proposed");
    await readInvoice(await post(cookie, `/actions/${id}/reject`));
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("validates refund JSON and positive decimal amounts before proposing", async () => {
    const { cookie, path } = await paidInvoice();
    for (const body of [
      { amount: 40 },
      { amount: "0" },
      { amount: "-1" },
      { amount: "0.001" },
      { amount: "1", currency: "EUR" },
    ]) {
      const response = await post(cookie, path, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
    }
    expect(
      (
        await app.request(path, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "text/plain" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await app.request(path, {
          method: "POST",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect((await list(cookie))[0]?.refundActions).toEqual([]);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("rejects malformed and mismatched refund payloads before calling PayPal", async () => {
    const { cookie, path, id: userId, invoice } = await paidInvoice();
    const proposed = await readInvoice(await post(cookie, path, { amount: "40" }), 201);
    const action = refundAction(proposed);
    const valid = {
      invoiceId: invoice.id,
      paymentId: action.paymentId,
      captureId: "CAPTURE-TEST",
      refund: {
        amount: { currency_code: "USD", value: "40" },
        note_to_payer: `Refund for invoice ${invoice.number}`,
      },
    };
    for (const payload of [
      {},
      { ...valid, extra: true },
      { ...valid, invoiceId: randomUUID() },
      { ...valid, paymentId: randomUUID() },
      { ...valid, captureId: "OTHER-CAPTURE" },
      { ...valid, refund: { ...valid.refund, extra: true } },
      {
        ...valid,
        refund: { ...valid.refund, amount: { ...valid.refund.amount, currency_code: "EUR" } },
      },
      { ...valid, refund: { ...valid.refund, note_to_payer: "Changed" } },
    ]) {
      await expect(
        actionHandlers(deps).refund_payment({ ...action, userId, payload }),
      ).rejects.toMatchObject({ code: "invalid_payload" });
    }
    expect(refundCapture).not.toHaveBeenCalled();
  });
});
