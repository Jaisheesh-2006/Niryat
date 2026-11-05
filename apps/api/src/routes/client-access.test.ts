import { randomBytes, randomUUID } from "node:crypto";
import * as db from "@niryat/db";
import { type Invoice, profileInputSchema } from "@niryat/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFor } from "../auth/testing";
import { createApp } from "../index";
import * as clock from "../rules";

const profile = profileInputSchema.parse({
  legalName: null,
  address: null,
  gstRegistered: true,
  gstin: null,
  lutNumber: "LUT",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
  workType: null,
  purposeCode: null,
  panLast4: null,
  expectedTurnoverInr: null,
  gstr1Frequency: "monthly",
  specifiedProfession: true,
});
const action = {
  id: randomUUID(),
  paymentId: null,
  status: "proposed",
  payload: { recipientEmail: "buyer@example.com" },
  error: null,
  createdAt: "2026-10-15T00:00:00.000Z",
} as const;
const invoice: Invoice = {
  id: randomUUID(),
  clientId: randomUUID(),
  clientName: "Synthetic client",
  type: "one_time",
  number: "2026-27/0001",
  fy: "2026-27",
  date: "2026-10-15",
  currency: "USD",
  amount: "100.00",
  description: "Software",
  sac: "998314",
  recurrence: null,
  status: "issued",
  pdfUrl: "/files/secret-token.pdf",
  paypalInvoiceId: null,
  paypalRecurringSeriesId: null,
  paidTotal: "0.00",
  payments: [],
  firaStatus: "pending",
  refundedTotal: "0.00",
  refunds: [],
  disputes: [],
  action: { ...action, paypalAction: "send_invoice" },
  refundActions: [{ ...action, id: randomUUID(), paypalAction: "refund_payment" }],
};
const routes = [
  ["GET", "/health-check"],
  ["GET", "/invoices"],
  ["GET", "/calendar"],
  ["GET", "/gstr1"],
  ["GET", "/advance-tax"],
  ["GET", "/dashboard"],
  ["GET", "/fira"],
  ["GET", "/tasks"],
  ["POST", "/gstr1/file"],
] as const;

describe("client access on adopted read routes", () => {
  const database = db.createDb("postgres://unused:unused@127.0.0.1:1/unused");
  const deps = {
    db: database.db,
    encryptionKey: randomBytes(32),
    sessionSecret: "x".repeat(32),
    secureCookies: false,
  };
  const app = createApp(deps);
  const freelancer = randomUUID();
  const client = randomUUID();
  const ca = randomUUID();
  const cookies = { freelancer: "", ca: "" };
  beforeAll(async () => {
    cookies.freelancer = await cookieFor(freelancer, deps.sessionSecret);
    cookies.ca = await cookieFor(ca, deps.sessionSecret, "ca");
  });
  beforeEach(() => {
    vi.spyOn(clock, "todayInIndia").mockReturnValue("2026-11-01");
    vi.spyOn(db, "getProfile").mockResolvedValue(profile);
    vi.spyOn(db, "gstRegistration").mockResolvedValue(true);
    vi.spyOn(db, "listInvoices").mockResolvedValue([invoice]);
    vi.spyOn(db, "listFiraDocuments").mockResolvedValue([]);
    vi.spyOn(db, "listTasks").mockResolvedValue([]);
    vi.spyOn(db, "hasAcceptedCaLink").mockImplementation(
      async (_db, caId, freelancerId) => caId === ca && freelancerId === client,
    );
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => database.close());

  function call(method: "GET" | "POST", path: string, cookie: string, query?: string) {
    return app.request(`${path}${query === undefined ? "" : `?client=${query}`}`, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      ...(method === "POST"
        ? {
            body: JSON.stringify({
              period: "2026-10",
              rates: { [invoice.id]: { inrRate: "84.1234", gstRate: "18" } },
            }),
          }
        : {}),
    });
  }
  function readOwners() {
    return [db.getProfile, db.listInvoices, db.listFiraDocuments, db.listTasks].flatMap((reader) =>
      vi.mocked(reader).mock.calls.map((args) => args[1]),
    );
  }

  it.each(routes)("%s %s applies the access matrix", async (method, path) => {
    const allowed: [string, string | undefined, string][] = [
      [cookies.freelancer, undefined, freelancer],
      [cookies.freelancer, freelancer, freelancer],
      [cookies.ca, client, client],
    ];
    for (const [cookie, query, owner] of allowed) {
      vi.clearAllMocks();
      const response = await call(method, path, cookie, query);
      expect(response.status).toBe(200);
      expect(new Set(readOwners())).toEqual(new Set([owner]));
    }
    const denied: [string, string | undefined, number][] = [
      [cookies.freelancer, client, 404],
      [cookies.ca, randomUUID(), 404],
      [cookies.ca, freelancer, 404],
      [cookies.ca, undefined, 404],
      [cookies.ca, "not-a-uuid", 404],
      ["", undefined, 401],
      ["", client, 401],
    ];
    for (const [cookie, query, status] of denied) {
      vi.clearAllMocks();
      const response = await call(method, path, cookie, query);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: status === 401 ? "unauthenticated" : "not_found",
      });
      expect(readOwners()).toEqual([]);
    }
  });

  it("hides action payloads and PDF tokens from a CA but not the owner", async () => {
    const owner = await (await call("GET", "/invoices", cookies.freelancer)).json();
    expect(owner).toMatchObject([
      { pdfUrl: invoice.pdfUrl, action: invoice.action, refundActions: invoice.refundActions },
    ]);
    const response = await call("GET", "/invoices", cookies.ca, client);
    const text = await response.text();
    expect(text).not.toContain("buyer@example.com");
    expect(text).not.toContain("secret-token");
    const [view] = JSON.parse(text);
    expect(view).toMatchObject({ id: invoice.id, number: invoice.number });
    for (const key of ["action", "refundActions", "pdfUrl"]) expect(view).not.toHaveProperty(key);
  });

  it.each([
    ["POST", "/clients"],
    ["POST", "/close"],
    ["POST", "/extract"],
    ["POST", "/fira"],
    ["POST", "/invoices"],
    ["POST", `/payments/${randomUUID()}/refunds`],
    ["PUT", "/profile"],
    ["POST", `/tasks/${randomUUID()}/done`],
  ])("keeps %s %s closed to a linked CA", async (method, path) => {
    const response = await app.request(`${path}?client=${client}`, {
      method,
      headers: { Cookie: cookies.ca, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
    expect(db.hasAcceptedCaLink).not.toHaveBeenCalled();
  });

  it("rejects a client query on the CA's portfolio assistant", async () => {
    const response = await app.request(`/dashboard/turn?client=${client}`, {
      method: "POST",
      headers: { Cookie: cookies.ca, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
    expect(db.hasAcceptedCaLink).not.toHaveBeenCalled();
  });
});
